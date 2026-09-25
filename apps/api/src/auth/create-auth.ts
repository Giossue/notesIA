import { createRecoveryMailRepository, createSecureStorage, createTracedPool } from "@notesia/db";
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
};

export function createAuth(options: AuthOptions) {
  const pool = createTracedPool(new Pool({ connectionString: options.databaseUrl, max: 5 }));
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
  const recoveryMail = options.recovery ? createRecoveryMailRepository(pool, options.secret) : null;
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
    secondaryStorage: createSecureStorage(pool, options.secret),
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const account = await pool.query<{ active: boolean; version: number }>(
              `SELECT suspendido_en IS NULL AS active, estado_version AS version
               FROM autenticacion.usuarios WHERE id = $1`,
              [session.userId],
            );
            if (!account.rows[0]?.active)
              throw APIError.from("FORBIDDEN", {
                code: "ACCOUNT_SUSPENDED",
                message: "Esta cuenta está suspendida.",
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
    trustedOrigins: ["notesia://"],
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

  return { auth, pool };
}
