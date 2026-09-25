import type { AvatarId } from "@notesia/contracts";
import { z } from "zod";
import { getApiBaseUrl } from "@/core/config/api";
import { clearSessionCookie, getSessionCookie, setSessionCookie } from "./session-storage";

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
});
const sessionSchema = z.object({ user: userSchema });
const registrationSchema = z.object({
  token: z.null(),
  user: z.object({ email: z.email(), emailVerified: z.literal(false) }).passthrough(),
});

export class AuthenticationError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AuthenticationError";
  }
}

export function isEmailVerificationRequired(error: unknown) {
  return error instanceof AuthenticationError && error.code === "EMAIL_NOT_VERIFIED";
}

export function emailVerificationCallbackResult(url: string) {
  const [withoutFragment] = url.split("#");
  const [base, query = ""] = (withoutFragment ?? "").split("?");
  if (base?.replace(/\/$/, "") !== "notesia://email-verified") return null;
  const error = new URLSearchParams(query).get("error");
  return error
    ? ({ kind: "error" as const, code: error } as const)
    : ({ kind: "verified" } as const);
}

export function sessionCookieFromHeader(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/(?:^|,\s*)((?:__Secure-)?better-auth\.session_token)=([^;,]*)/);
  return match?.[2] ? `${match[1]}=${match[2]}` : null;
}

async function authRequest(
  path: string,
  options: { method?: "GET" | "POST"; body?: unknown } = {},
) {
  const cookie = await getSessionCookie();
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}/auth${path}`, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        Origin: "notesia://",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      credentials: "omit",
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new Error("No se pudo contactar al servidor local.");
  }
  if (!response.ok) {
    const body = (await response
      .clone()
      .json()
      .catch(() => null)) as { code?: unknown } | null;
    const code = typeof body?.code === "string" ? body.code : "AUTH_ERROR";
    const message =
      code === "EMAIL_NOT_VERIFIED"
        ? "Verifica tu correo antes de iniciar sesión."
        : response.status === 429
          ? "Demasiados intentos. Inténtalo más tarde."
          : "La autenticación no pudo completarse.";
    throw new AuthenticationError(message, code, response.status);
  }
  const newCookie = sessionCookieFromHeader(response.headers.get("set-cookie"));
  if (newCookie) await setSessionCookie(newCookie);
  return response;
}

export async function getCurrentUser() {
  if (!(await getSessionCookie())) return null;
  let response: Response;
  try {
    response = await authRequest("/get-session");
  } catch (error) {
    if (!(error instanceof AuthenticationError) || error.status !== 401) throw error;
    await clearSessionCookie();
    return null;
  }
  const data: unknown = await response.json();
  if (data === null) {
    await clearSessionCookie();
    return null;
  }
  const parsed = sessionSchema.safeParse(data);
  if (!parsed.success) throw new Error("El servidor devolvió una sesión inesperada.");
  return parsed.data.user;
}

export async function signIn(email: string, password: string) {
  await authRequest("/sign-in/email", {
    method: "POST",
    body: { email, password },
  });
  if (!(await getSessionCookie())) throw new Error("No se pudo guardar la sesión de forma segura.");
}

export async function signUp(name: string, email: string, password: string, avatar: AvatarId) {
  const response = await authRequest("/sign-up/email", {
    method: "POST",
    body: { name, email, password, avatar },
  });
  const parsed = registrationSchema.safeParse(await response.json());
  if (!parsed.success || (await getSessionCookie())) {
    await clearSessionCookie();
    throw new Error("El servidor devolvió un registro inesperado.");
  }
  return { email: parsed.data.user.email };
}

export async function resendVerificationEmail(email: string) {
  await authRequest("/send-verification-email", {
    method: "POST",
    body: { email },
  });
}

export async function requestPasswordReset(email: string) {
  await authRequest("/request-password-reset", {
    method: "POST",
    body: { email: email.trim().toLowerCase() },
  });
}

export async function signOut() {
  if (await getSessionCookie()) {
    await authRequest("/sign-out", { method: "POST" });
  }
  await clearSessionCookie();
}
