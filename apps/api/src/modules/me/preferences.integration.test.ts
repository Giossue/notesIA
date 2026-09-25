import { afterAll, expect, test } from "bun:test";
import {
  createNotificationSchedulerRepository,
  createPreferenceRepository,
  createProfileRepository,
} from "@notesia/db";
import type { Pool } from "pg";
import { createApp } from "../../app";
import { createAuth } from "../../auth/create-auth";

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("DATABASE_URL is required for local integration tests");
const testUrl = new URL(sourceUrl);
if (
  !["127.0.0.1", "localhost", "::1"].includes(testUrl.hostname) ||
  testUrl.pathname !== "/notesia_dev"
) {
  throw new Error("Preference integration tests only run against local notesia_dev credentials");
}
const { auth, pool } = createAuth({
  databaseUrl: testUrl.toString(),
  secret: crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""),
  baseURL: "http://127.0.0.1:3000",
  allowSignUp: true,
  allowUnverifiedEmailForTests: true,
});
const getSession = (headers: Headers) => auth.api.getSession({ headers });
const app = createApp(async () => {}, auth.handler, {
  getSession,
  profiles: createProfileRepository(pool),
  preferences: createPreferenceRepository(pool),
});
const emailA = `preferences-a-${crypto.randomUUID()}@example.test`;
const emailB = `preferences-b-${crypto.randomUUID()}@example.test`;
let cookieA = "";
let cookieB = "";

async function register(email: string) {
  const response = await app.request("/v1/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
    body: JSON.stringify({ name: "Estudiante", email, password: "PreferencesIntegration2026!" }),
  });
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}
afterAll(async () => {
  for (const cookie of [cookieA, cookieB]) {
    if (cookie)
      await app.request("/v1/auth/sign-out", {
        method: "POST",
        headers: { cookie, origin: "http://127.0.0.1:3000" },
      });
  }
  await pool.query("DELETE FROM autenticacion.usuarios WHERE correo IN ($1,$2)", [emailA, emailB]);
  await pool.end();
});

test("preferences are created with the account, private and versioned", async () => {
  expect((await app.request("/v1/me/preferences")).status).toBe(401);
  cookieA = await register(emailA);
  cookieB = await register(emailB);
  const initial = await app.request("/v1/me/preferences", { headers: { cookie: cookieA } });
  expect(initial.status).toBe(200);
  expect(await initial.json()).toMatchObject({
    minSessionMinutes: 25,
    maxSessionMinutes: 90,
    maxDailyMinutes: 240,
    notificationsEnabled: true,
    pushNotificationsEnabled: true,
    version: 1,
  });
  const changed = {
    minSessionMinutes: 30,
    maxSessionMinutes: 80,
    maxDailyMinutes: 180,
    notificationsEnabled: false,
    quietStartMinute: 1380,
    quietEndMinute: 360,
    version: 1,
  };
  const update = await app.request("/v1/me/preferences", {
    method: "PATCH",
    headers: { cookie: cookieA, "content-type": "application/json" },
    body: JSON.stringify(changed),
  });
  expect(update.status).toBe(200);
  expect(await update.json()).toMatchObject({
    ...changed,
    pushNotificationsEnabled: true,
    version: 2,
  });
  expect(
    (
      await app.request("/v1/me/preferences", {
        method: "PATCH",
        headers: { cookie: cookieA, "content-type": "application/json" },
        body: JSON.stringify(changed),
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await app.request("/v1/me/preferences", {
        method: "PATCH",
        headers: { cookie: cookieA, "content-type": "application/json" },
        body: JSON.stringify({ ...changed, version: 2, minSessionMinutes: 90 }),
      })
    ).status,
  ).toBe(422);
  const actor = await pool.query<{ id: string }>(
    "SELECT id FROM autenticacion.usuarios WHERE correo = $1",
    [emailA],
  );
  const actorId = actor.rows[0]?.id;
  const revision = () =>
    pool.query<{ revision: string }>(
      "SELECT revision::text FROM dominio.revisiones_planificacion WHERE usuario_id = $1",
      [actorId],
    );
  const beforeChannelChange = (await revision()).rows[0]?.revision;
  const channelOnly = await app.request("/v1/me/preferences", {
    method: "PATCH",
    headers: { cookie: cookieA, "content-type": "application/json" },
    body: JSON.stringify({
      ...changed,
      notificationsEnabled: true,
      pushNotificationsEnabled: false,
      version: 2,
    }),
  });
  expect(channelOnly.status).toBe(200);
  expect(await channelOnly.json()).toMatchObject({
    notificationsEnabled: true,
    pushNotificationsEnabled: false,
    version: 3,
  });
  expect((await revision()).rows[0]?.revision).toBe(beforeChannelChange);
  const deviceId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO dominio.dispositivos_push (usuario_id, id, plataforma, token_cifrado)
     VALUES ($1,$2,'android',$3)`,
    [actorId, deviceId, Buffer.alloc(32)],
  );
  const scheduler = createNotificationSchedulerRepository(pool);
  const now = new Date("2026-10-05T12:00:00.000Z");
  const createDueActivity = async (deadlineAt: string) => {
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO dominio.actividades
       (id, usuario_id, tipo, titulo, prioridad, fecha_limite, minutos_estimados)
       VALUES ($1,$2,'academic_task','Aviso de prueba','medium',$3,60)`,
      [id, actorId, deadlineAt],
    );
    return id;
  };
  const pushDisabledActivity = await createDueActivity("2026-10-05T13:00:00.000Z");
  await scheduler.processDue(now);
  const deliveryCount = (activityId: string) =>
    pool.query<{ notices: string; pushes: string }>(
      `SELECT count(DISTINCT n.id)::text AS notices, count(p.id)::text AS pushes
     FROM dominio.notificaciones n LEFT JOIN dominio.envios_push p
       ON p.notificacion_id = n.id
     WHERE n.usuario_id = $1 AND n.actividad_id = $2`,
      [actorId, activityId],
    );
  expect((await deliveryCount(pushDisabledActivity)).rows[0]).toEqual({
    notices: "1",
    pushes: "0",
  });
  const pushEnabled = await app.request("/v1/me/preferences", {
    method: "PATCH",
    headers: { cookie: cookieA, "content-type": "application/json" },
    body: JSON.stringify({
      ...changed,
      notificationsEnabled: true,
      pushNotificationsEnabled: true,
      version: 3,
    }),
  });
  expect(pushEnabled.status).toBe(200);
  const pushEnabledActivity = await createDueActivity("2026-10-05T14:00:00.000Z");
  await scheduler.processDue(now);
  expect((await deliveryCount(pushEnabledActivity)).rows[0]).toEqual({
    notices: "1",
    pushes: "1",
  });
  const changedDuringScan = await createDueActivity("2026-10-05T13:30:00.000Z");
  let disabledAfterScan = false;
  const interleavedPool = {
    query: async (queryText: string, values?: unknown[]) => {
      const result = await pool.query<{ activityId?: string }>(queryText, values);
      if (!disabledAfterScan && result.rows.some((row) => row.activityId === changedDuringScan)) {
        disabledAfterScan = true;
        const disabled = await app.request("/v1/me/preferences", {
          method: "PATCH",
          headers: { cookie: cookieA, "content-type": "application/json" },
          body: JSON.stringify({
            ...changed,
            notificationsEnabled: false,
            pushNotificationsEnabled: true,
            version: 4,
          }),
        });
        expect(disabled.status).toBe(200);
      }
      return result;
    },
    connect: pool.connect.bind(pool),
  } as unknown as Pool;
  expect(await createNotificationSchedulerRepository(interleavedPool).processDue(now)).toBe(0);
  expect(disabledAfterScan).toBe(true);
  expect((await deliveryCount(changedDuringScan)).rows[0]).toEqual({
    notices: "0",
    pushes: "0",
  });
  expect(
    await (
      await app.request("/v1/me/preferences", {
        headers: { cookie: cookieB },
      })
    ).json(),
  ).toMatchObject({
    minSessionMinutes: 25,
    notificationsEnabled: true,
    pushNotificationsEnabled: true,
    version: 1,
  });
});
