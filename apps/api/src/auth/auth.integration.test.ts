import { afterAll, describe, expect, test } from "bun:test";
import { problemSchema } from "@notesia/contracts";
import { createProfileRepository, createSecureStorage } from "@notesia/db";
import { createApp } from "../app";
import { createAuth } from "./create-auth";

const developmentUrl = process.env.DATABASE_URL;
if (!developmentUrl)
  throw new Error("DATABASE_URL is required for the local auth integration test");
const testUrl = new URL(developmentUrl);
if (
  !["127.0.0.1", "localhost", "::1"].includes(testUrl.hostname) ||
  testUrl.pathname !== "/notesia_dev"
) {
  throw new Error("Auth integration tests only run against local notesia_dev credentials");
}

const authSecret =
  crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
const { auth, pool } = createAuth({
  databaseUrl: testUrl.toString(),
  secret: authSecret,
  baseURL: "http://127.0.0.1:3000",
  allowSignUp: true,
  allowUnverifiedEmailForTests: true,
});
const app = createApp(async () => {}, auth.handler, {
  getSession: (headers) => auth.api.getSession({ headers }),
  profiles: createProfileRepository(pool),
});
const email = `auth-test-${crypto.randomUUID()}@example.test`;
const otherEmail = `auth-test-${crypto.randomUUID()}@example.test`;
const expiredEmail = `auth-expired-${crypto.randomUUID()}@example.test`;

afterAll(async () => {
  await pool.query("DELETE FROM autenticacion.usuarios WHERE correo = $1", [email]);
  await pool.query("DELETE FROM autenticacion.usuarios WHERE correo = $1", [otherEmail]);
  await pool.query("DELETE FROM autenticacion.usuarios WHERE correo = $1", [expiredEmail]);
  await pool.query("DELETE FROM autenticacion.almacen_seguro WHERE expira_en <= now()");
  await pool.end();
});

describe("Better Auth with encrypted PostgreSQL sessions", () => {
  test("an expired session cannot access private routes", async () => {
    const registration = await app.request("/v1/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
      body: JSON.stringify({
        name: "Sesión vencida",
        email: expiredEmail,
        password: "ExpiredSessionIntegration2026!",
      }),
    });
    expect(registration.status).toBe(200);
    const cookie = registration.headers.get("set-cookie")?.split(";")[0] ?? "";
    const token = ((await registration.json()) as { token: string }).token;
    expect((await app.request("/v1/me", { headers: { cookie } })).status).toBe(200);
    const storage = createSecureStorage(pool, authSecret);
    const value = await storage.get(token);
    expect(value).toBeTruthy();
    await storage.set(token, value as string, -1);
    const expired = await app.request("/v1/me", { headers: { cookie } });
    expect(expired.status).toBe(401);
    expect(expired.headers.get("content-type")).toContain("application/problem+json");
    expect((await expired.json()) as { code: string }).toMatchObject({ code: "AUTH_REQUIRED" });
  });

  test("registers, stores only protected session data, and revokes on sign-out", async () => {
    const anonymous = await app.request("/v1/me");
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("content-type")).toContain("application/problem+json");

    const registration = await app.request("/v1/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
      body: JSON.stringify({ name: "Auth Test", email, password: "IntegrationPassword2026!" }),
    });
    expect(registration.status).toBe(200);
    const signupBody = (await registration.json()) as { token: string };
    const cookie = registration.headers.get("set-cookie")?.split(";")[0];
    expect(cookie).toBeTruthy();

    const ownProfile = await app.request("/v1/me", { headers: { cookie: cookie ?? "" } });
    expect(ownProfile.status).toBe(200);
    const initialProfile = (await ownProfile.json()) as { displayName: string; version: number };
    expect(initialProfile).toMatchObject({ displayName: "Auth Test", version: 1 });

    const update = await app.request("/v1/me/profile", {
      method: "PATCH",
      headers: { cookie: cookie ?? "", "content-type": "application/json" },
      body: JSON.stringify({
        displayName: "Nombre nuevo",
        language: "es",
        timeZone: "America/Guayaquil",
        version: 1,
      }),
    });
    expect(update.status).toBe(200);
    expect(await update.json()).toMatchObject({ displayName: "Nombre nuevo", version: 2 });

    const stale = await app.request("/v1/me/profile", {
      method: "PATCH",
      headers: { cookie: cookie ?? "", "content-type": "application/json" },
      body: JSON.stringify({
        displayName: "Cambio viejo",
        language: "es",
        timeZone: "Etc/UTC",
        version: 1,
      }),
    });
    expect(stale.status).toBe(409);

    const invalidZone = await app.request("/v1/me/profile", {
      method: "PATCH",
      headers: { cookie: cookie ?? "", "content-type": "application/json" },
      body: JSON.stringify({
        displayName: "Prueba",
        language: "es",
        timeZone: "Zona falsa",
        version: 2,
      }),
    });
    expect(invalidZone.status).toBe(422);

    const bypassProfile = await app.request("/v1/auth/update-user", {
      method: "POST",
      headers: {
        cookie: cookie ?? "",
        origin: "http://127.0.0.1:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Untracked name" }),
    });
    expect(bypassProfile.status).toBe(404);
    expect(bypassProfile.headers.get("content-type")).toContain("application/problem+json");
    const accountName = await pool.query<{ name: string }>(
      "SELECT nombre AS name FROM autenticacion.usuarios WHERE correo = $1",
      [email],
    );
    expect(accountName.rows[0]?.name).toBe("Auth Test");

    const bypassDeletion = await app.request("/v1/auth/delete-user", {
      method: "POST",
      headers: { cookie: cookie ?? "", origin: "http://127.0.0.1:3000" },
    });
    expect(bypassDeletion.status).toBe(404);

    const secondRegistration = await app.request("/v1/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
      body: JSON.stringify({
        name: "Otro usuario",
        email: otherEmail,
        password: "OtherIntegrationPassword2026!",
      }),
    });
    expect(secondRegistration.status).toBe(200);
    const otherCookie = secondRegistration.headers.get("set-cookie")?.split(";")[0];
    const otherProfile = await app.request("/v1/me", { headers: { cookie: otherCookie ?? "" } });
    expect(await otherProfile.json()).toMatchObject({
      displayName: "Otro usuario",
      version: 1,
      email: otherEmail,
    });
    const otherSignOut = await app.request("/v1/auth/sign-out", {
      method: "POST",
      headers: { cookie: otherCookie ?? "", origin: "http://127.0.0.1:3000" },
    });
    expect(otherSignOut.status).toBe(200);

    const account = await pool.query<{ password: string }>(
      "SELECT a.contrasena AS password FROM autenticacion.cuentas a JOIN autenticacion.usuarios u ON u.id = a.usuario_id WHERE u.correo = $1",
      [email],
    );
    expect(account.rows[0]?.password.startsWith("$argon2id$")).toBe(true);

    const storage = await pool.query<{ key_hash: Buffer; payload: Buffer | null }>(
      "SELECT clave_hash AS key_hash, contenido AS payload FROM autenticacion.almacen_seguro WHERE contenido IS NOT NULL",
    );
    expect(storage.rows.length).toBeGreaterThan(0);
    for (const row of storage.rows) {
      expect(row.key_hash.length).toBe(32);
      expect(row.payload?.includes(Buffer.from(signupBody.token))).toBe(false);
    }

    const current = await app.request("/v1/auth/get-session", {
      headers: { cookie: cookie ?? "" },
    });
    expect(((await current.json()) as { user?: { email?: string } } | null)?.user?.email).toBe(
      email,
    );

    const signOut = await app.request("/v1/auth/sign-out", {
      method: "POST",
      headers: { cookie: cookie ?? "", origin: "http://127.0.0.1:3000" },
    });
    expect(signOut.status).toBe(200);

    const revoked = await app.request("/v1/auth/get-session", {
      headers: { cookie: cookie ?? "" },
    });
    expect(((await revoked.json()) as { user?: unknown } | null)?.user).toBeUndefined();

    const nativeHeaders = {
      "content-type": "application/json",
      origin: "notesia://",
    };
    const invalid = await app.request("/v1/auth/sign-in/email", {
      method: "POST",
      headers: nativeHeaders,
      body: JSON.stringify({ email, password: "IncorrectPassword2026!" }),
    });
    expect(invalid.status).toBe(401);
    expect(invalid.headers.get("content-type")).toContain("application/problem+json");
    expect(problemSchema.safeParse(await invalid.json()).success).toBe(true);

    const login = await app.request("/v1/auth/sign-in/email", {
      method: "POST",
      headers: nativeHeaders,
      body: JSON.stringify({ email, password: "IntegrationPassword2026!" }),
    });
    expect(login.status).toBe(200);
    const nativeCookie = login.headers.get("set-cookie")?.split(";")[0];
    expect(nativeCookie).toBeTruthy();

    const restored = await app.request("/v1/auth/get-session", {
      headers: { cookie: nativeCookie ?? "", origin: nativeHeaders.origin },
    });
    expect(((await restored.json()) as { user?: { email?: string } } | null)?.user?.email).toBe(
      email,
    );

    const nativeSignOut = await app.request("/v1/auth/sign-out", {
      method: "POST",
      headers: { cookie: nativeCookie ?? "", origin: nativeHeaders.origin },
    });
    expect(nativeSignOut.status).toBe(200);
  });
});
