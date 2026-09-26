import { afterAll, expect, test } from "bun:test";
import { avatarIds, defaultAvatarId } from "@notesia/contracts";
import { createProfileRepository } from "@notesia/db";
import { createApp } from "../../app";
import { createAuth } from "../../auth/create-auth";

const developmentUrl = process.env.DATABASE_URL;
if (!developmentUrl) throw new Error("DATABASE_URL is required for local integration tests");
const testUrl = new URL(developmentUrl);
if (
  !["127.0.0.1", "localhost", "::1"].includes(testUrl.hostname) ||
  testUrl.pathname !== "/notesia_dev"
) {
  throw new Error("Avatar integration tests only run against local notesia_dev credentials");
}

const { auth, pool } = createAuth({
  databaseUrl: testUrl.toString(),
  secret: crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""),
  baseURL: "http://127.0.0.1:3000",
  allowSignUp: true,
  allowUnverifiedEmailForTests: true,
});
const app = createApp(async () => {}, auth.handler, {
  getSession: (headers) => auth.api.getSession({ headers }),
  profiles: createProfileRepository(pool),
});
const avatarEmail = `avatar-${crypto.randomUUID()}@example.test`;
const badAvatarEmail = `avatar-bad-${crypto.randomUUID()}@example.test`;

afterAll(async () => {
  await pool.query("DELETE FROM autenticacion.usuarios WHERE correo = ANY($1)", [
    [avatarEmail, badAvatarEmail],
  ]);
  await pool.end();
});

test("the avatar is chosen at sign-up, can change later and only accepts known ids", async () => {
  const chosen = avatarIds.find((id) => id !== defaultAvatarId) ?? defaultAvatarId;
  const rejected = await app.request("/v1/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
    body: JSON.stringify({
      name: "Avatar inválido",
      email: badAvatarEmail,
      password: "AvatarIntegrationPassword2026!",
      avatar: "no-existe",
    }),
  });
  expect(rejected.status).toBe(400);

  const registration = await app.request("/v1/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
    body: JSON.stringify({
      name: "Con avatar",
      email: avatarEmail,
      password: "AvatarIntegrationPassword2026!",
      avatar: chosen,
    }),
  });
  expect(registration.status).toBe(200);
  const cookie = registration.headers.get("set-cookie")?.split(";")[0] ?? "";
  const profile = await app.request("/v1/me", { headers: { cookie } });
  expect(await profile.json()).toMatchObject({ avatar: chosen, version: 1 });
  // El avatar vive solo en el perfil; usuarios.avatar queda nulo tras el registro.
  const stored = await pool.query<{ avatar: string | null }>(
    "SELECT avatar FROM autenticacion.usuarios WHERE correo = $1",
    [avatarEmail],
  );
  expect(stored.rows).toEqual([{ avatar: null }]);

  const invalid = await app.request("/v1/me/profile", {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      displayName: "Con avatar",
      language: "es",
      timeZone: "America/Guayaquil",
      avatar: "no-existe",
      version: 1,
    }),
  });
  expect(invalid.status).toBe(422);

  const changed = await app.request("/v1/me/profile", {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      displayName: "Avatar renombrado",
      language: "es",
      timeZone: "America/Guayaquil",
      avatar: defaultAvatarId,
      version: 1,
    }),
  });
  expect(changed.status).toBe(200);
  expect(await changed.json()).toMatchObject({ avatar: defaultAvatarId, version: 2 });
  // El nombre del perfil se replica a usuarios.nombre en la misma transacción.
  const renamed = await pool.query<{ nombre: string }>(
    "SELECT nombre FROM autenticacion.usuarios WHERE correo = $1",
    [avatarEmail],
  );
  expect(renamed.rows).toEqual([{ nombre: "Avatar renombrado" }]);
});
