import { avatarIdSchema } from "@notesia/contracts";
import {
  createRecoveryMailRepository,
  createSecureStorage,
  createTracedPool,
  createVerificationMailRepository,
} from "@notesia/db";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { twoFactor } from "better-auth/plugins";
import { PostgresDialect } from "kysely";
import { Pool } from "pg";
import { hashPassword, verifyPassword } from "./password";

type AuthOptions = {
  databaseUrl: string;
  secret: string;
  baseURL: string;
  allowSignUp?: boolean;
  rateLimitEnabled?: boolean;
  recovery?: { resetUrl: string; tokenTtlSeconds?: number };
  verificationMail?: { tokenTtlSeconds?: number };
  allowUnverifiedEmailForTests?: boolean;
  trustedOrigins?: string[];
};

const VERIFICATION_CALLBACK_URL = "notesia://email-verified";

export function createAuth(options: AuthOptions) {
  const recoveryUrl = options.recovery ? new URL(options.recovery.resetUrl) : null;
  if (
    recoveryUrl &&
    (recoveryUrl.protocol !== "https:" ||
      recoveryUrl.username ||
      recoveryUrl.password ||
      recoveryUrl.hash ||
      recoveryUrl.searchParams.has("token"))
  )
    throw new Error("PASSWORD_RESET_URL must be HTTPS without credentials, hash or token");
  const tokenTtlSeconds = options.recovery?.tokenTtlSeconds ?? 900;
  if (!Number.isInteger(tokenTtlSeconds) || tokenTtlSeconds < 1 || tokenTtlSeconds > 3600)
    throw new Error("Invalid recovery token lifetime");
  const verificationTtlSeconds = options.verificationMail?.tokenTtlSeconds ?? 3600;
  if (
    !Number.isInteger(verificationTtlSeconds) ||
    verificationTtlSeconds < 1 ||
    verificationTtlSeconds > 86400
  )
    throw new Error("Invalid email verification token lifetime");
  const requireEmailVerification = options.allowUnverifiedEmailForTests !== true;
  if (options.allowSignUp && requireEmailVerification && !options.verificationMail)
    throw new Error("SMTP configuration is required when account registration is enabled");
  const pool = createTracedPool(new Pool({ connectionString: options.databaseUrl, max: 5 }));
  const recoveryMail = options.recovery ? createRecoveryMailRepository(pool, options.secret) : null;
  const verificationMail = options.verificationMail
    ? createVerificationMailRepository(pool, options.secret)
    : null;
  const auth = betterAuth({
    appName: "NotesIA",
    baseURL: options.baseURL,
    basePath: "/v1/auth",
    secret: options.secret,
    database: {
      dialect: new PostgresDialect({ pool }),
      type: "postgres",
      schemaName: "autenticacion",
    },
    user: {
      modelName: "usuarios",
      fields: {
        name: "nombre",
        email: "correo",
        emailVerified: "correo_verificado",
        image: "imagen",
        createdAt: "creado_en",
        updatedAt: "actualizado_en",
      },
      // Avatar elegido al registrarse; el trigger crear_perfil_usuario lo copia al perfil.
      additionalFields: {
        avatar: {
          type: "string",
          required: false,
          input: true,
          returned: false,
          fieldName: "avatar",
          validator: { input: avatarIdSchema },
        },
      },
    },
    account: {
      modelName: "cuentas",
      fields: {
        accountId: "cuenta_id",
        providerId: "proveedor_id",
        userId: "usuario_id",
        accessToken: "token_acceso",
        refreshToken: "token_refresco",
        idToken: "token_id",
        accessTokenExpiresAt: "token_acceso_expira_en",
        refreshTokenExpiresAt: "token_refresco_expira_en",
        scope: "alcance",
        password: "contrasena",
        createdAt: "creado_en",
        updatedAt: "actualizado_en",
      },
    },
    verification: {
      modelName: "verificaciones",
      storeIdentifier: "hashed",
      storeInDatabase: false,
      fields: {
        identifier: "identificador",
        value: "valor",
        expiresAt: "expira_en",
        createdAt: "creado_en",
        updatedAt: "actualizado_en",
      },
    },
    secondaryStorage: createSecureStorage(pool, options.secret, {
      requireVerifiedEmail: requireEmailVerification,
    }),
    emailVerification: verificationMail
      ? {
          expiresIn: verificationTtlSeconds,
          sendOnSignUp: true,
          sendOnSignIn: false,
          autoSignInAfterVerification: false,
          sendVerificationEmail: async ({ user, token }) => {
            const url = new URL("/v1/auth/verify-email", options.baseURL);
            url.searchParams.set("token", token);
            url.searchParams.set("callbackURL", VERIFICATION_CALLBACK_URL);
            await verificationMail.enqueue(user.id, url.toString(), verificationTtlSeconds);
          },
        }
      : undefined,
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const account = await pool.query<{
              active: boolean;
              emailVerified: boolean;
              version: number;
            }>(
              `SELECT suspendido_en IS NULL AS active, estado_version AS version
                 , correo_verificado AS "emailVerified"
               FROM autenticacion.usuarios WHERE id = $1`,
              [session.userId],
            );
            if (!account.rows[0]?.active)
              throw APIError.from("FORBIDDEN", {
                code: "ACCOUNT_SUSPENDED",
                message: "Esta cuenta está suspendida.",
              });
            if (requireEmailVerification && !account.rows[0].emailVerified)
              throw APIError.from("FORBIDDEN", {
                code: "EMAIL_NOT_VERIFIED",
                message: "Verifica tu correo antes de iniciar sesión.",
              });
            return { data: { ...session, notesiaAccountVersion: account.rows[0].version } };
          },
        },
      },
    },
    rateLimit: { enabled: options.rateLimitEnabled ?? true, storage: "secondary-storage" },
    advanced: {
      database: { generateId: "uuid" },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: !options.allowSignUp,
      requireEmailVerification,
      autoSignIn: !requireEmailVerification,
      minPasswordLength: 12,
      resetPasswordTokenExpiresIn: tokenTtlSeconds,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: recoveryMail
        ? async ({ user, token }) => {
            if (!recoveryUrl) throw new Error("Recovery URL unavailable");
            const url = new URL(recoveryUrl);
            url.searchParams.set("token", token);
            await recoveryMail.enqueue(user.id, url.toString(), tokenTtlSeconds);
          }
        : undefined,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    trustedOrigins: ["notesia://", VERIFICATION_CALLBACK_URL, ...(options.trustedOrigins ?? [])],
    plugins: [
      twoFactor({
        issuer: "NotesIA",
        twoFactorTable: "segundos_factores",
        skipVerificationOnEnable: false,
        trustDeviceMaxAge: 0,
        schema: {
          user: { fields: { twoFactorEnabled: "segundo_factor_habilitado" } },
          twoFactor: {
            fields: {
              userId: "usuario_id",
              secret: "secreto",
              backupCodes: "codigos_respaldo",
              verified: "verificado",
              failedVerificationCount: "fallos_verificacion",
              lockedUntil: "bloqueado_hasta",
            },
          },
        },
      }),
    ],
  });

  const getSession = async (headers: Headers) => {
    const session = await auth.api.getSession({ headers });
    return !requireEmailVerification || session?.user.emailVerified ? session : null;
  };
  const handler = async (request: Request) => {
    const requestUrl = new URL(request.url);
    const callbackUrl = requestUrl.searchParams.get("callbackURL");
    if (
      requestUrl.pathname === "/v1/auth/verify-email" &&
      callbackUrl !== null &&
      callbackUrl !== VERIFICATION_CALLBACK_URL
    )
      return Response.json(
        { code: "INVALID_CALLBACK_URL", message: "El retorno de verificación no es válido." },
        { status: 400 },
      );
    const response = await auth.handler(request);
    if (!requireEmailVerification || !response.ok || requestUrl.pathname !== "/v1/auth/get-session")
      return response;
    const body = (await response
      .clone()
      .json()
      .catch(() => null)) as {
      user?: { emailVerified?: boolean };
    } | null;
    if (!body?.user || body.user.emailVerified) return response;
    const headers = new Headers(response.headers);
    headers.delete("Content-Length");
    headers.set("Content-Type", "application/json");
    return new Response("null", { status: 200, headers });
  };

  return { auth, pool, getSession, handler };
}
