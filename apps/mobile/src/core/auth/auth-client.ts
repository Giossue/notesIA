import { z } from "zod";
import { apiBaseUrl } from "@/core/config/api";
import { clearSessionCookie, getSessionCookie, setSessionCookie } from "./session-storage";

const userSchema = z.object({ id: z.string(), name: z.string(), email: z.email() });
const sessionSchema = z.object({ user: userSchema });

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
    response = await fetch(`${apiBaseUrl}/auth${path}`, {
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
  if (!response.ok) throw new Error("La autenticación no pudo completarse.");
  const newCookie = sessionCookieFromHeader(response.headers.get("set-cookie"));
  if (newCookie) await setSessionCookie(newCookie);
  return response;
}

export async function getCurrentUser() {
  if (!(await getSessionCookie())) return null;
  const response = await authRequest("/get-session");
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
  await authRequest("/sign-in/email", { method: "POST", body: { email, password } });
  if (!(await getSessionCookie())) throw new Error("No se pudo guardar la sesión de forma segura.");
}

export async function signUp(name: string, email: string, password: string) {
  await authRequest("/sign-up/email", { method: "POST", body: { name, email, password } });
  if (!(await getSessionCookie())) throw new Error("No se pudo guardar la sesión de forma segura.");
}

export async function signOut() {
  if (await getSessionCookie()) await authRequest("/sign-out", { method: "POST" });
  await clearSessionCookie();
}
