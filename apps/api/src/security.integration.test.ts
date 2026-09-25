import { afterAll, beforeAll, expect, test } from "bun:test";
import { join } from "node:path";
import {
  assertApprovedLocalDatabase,
  type DatabaseTargetIdentity,
  databaseTargetIdentitySql,
} from "@notesia/db";
import { Pool } from "pg";
import { aiCases } from "./modules/ai/cases";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for security integration tests");
const target = new URL(databaseUrl);
if (
  !["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
  target.pathname !== "/notesia_dev"
)
  throw new Error("Security integration tests only run against local notesia_dev");
if (!process.env.BETTER_AUTH_SECRET) throw new Error("BETTER_AUTH_SECRET is required");

const pool = new Pool({ connectionString: databaseUrl });
const email = `security-owner-${crypto.randomUUID()}@example.test`;
const otherEmail = `security-other-${crypto.randomUUID()}@example.test`;
const id = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const date = "2026-10-05";
type Route = { method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; path: string };
const route = (method: Route["method"], path: string): Route => ({ method, path });

const adminRoutes: Route[] = [
  route("GET", "/v1/admin/system-health"),
  route("GET", "/v1/admin/ai/usage"),
  route("GET", "/v1/admin/ai/providers"),
  route("PUT", "/v1/admin/ai/providers/openai"),
  route("GET", "/v1/admin/ai/routes"),
  route("PUT", "/v1/admin/ai/routes/extract_activity"),
  route("POST", "/v1/admin/ai/routes/extract_activity/test"),
  route("GET", "/v1/admin/users"),
  route("PUT", `/v1/admin/users/${id}/suspension`),
  route("GET", "/v1/admin/roles"),
  route("PUT", `/v1/admin/roles/${id}`),
  route("DELETE", `/v1/admin/roles/${id}`),
  route("GET", "/v1/admin/privacy-documents"),
  route("POST", "/v1/admin/privacy-documents"),
  route("POST", `/v1/admin/privacy-documents/${id}/publish`),
  route("GET", "/v1/admin/audit"),
];

const privateRoutes: Route[] = [
  route("GET", "/v1/me"),
  route("PATCH", "/v1/me/profile"),
  route("GET", "/v1/me/preferences"),
  route("PATCH", "/v1/me/preferences"),
  route("GET", "/v1/me/notification-preferences"),
  route("PATCH", "/v1/me/notification-preferences"),
  route("GET", "/v1/me/push-devices"),
  route("POST", "/v1/me/push-devices"),
  route("DELETE", `/v1/me/push-devices/${id}`),
  route("GET", "/v1/me/deletion-request"),
  route("POST", "/v1/me/deletion-request"),
  route("DELETE", "/v1/me/deletion-request"),
  route("POST", "/v1/me/export"),
  route("GET", "/v1/me/consents"),
  route("POST", "/v1/me/consents"),
  route("POST", "/v1/me/consents/ai/revoke"),
  route("GET", "/v1/subjects"),
  route("GET", `/v1/subjects/${id}`),
  route("POST", "/v1/subjects"),
  route("PATCH", `/v1/subjects/${id}`),
  ...["archive", "restore"].map((action) => route("POST", `/v1/subjects/${id}/${action}`)),
  route("GET", "/v1/academic-periods"),
  route("GET", `/v1/academic-periods/${id}`),
  route("POST", "/v1/academic-periods"),
  route("PATCH", `/v1/academic-periods/${id}`),
  ...["archive", "restore"].map((action) => route("POST", `/v1/academic-periods/${id}/${action}`)),
  route("GET", "/v1/activities"),
  route("GET", `/v1/activities/${id}`),
  route("GET", `/v1/activities/${id}/history`),
  route("POST", "/v1/activities"),
  route("PATCH", `/v1/activities/${id}`),
  route("DELETE", `/v1/activities/${id}`),
  route("PATCH", `/v1/activities/${id}/progress`),
  ...["archive", "restore", "complete", "reopen", "cancel"].map((action) =>
    route("POST", `/v1/activities/${id}/${action}`),
  ),
  route("GET", "/v1/activity-series"),
  route("GET", `/v1/activity-series/${id}`),
  route("POST", "/v1/activity-series"),
  route("GET", `/v1/activities/${id}/subtasks`),
  route("POST", `/v1/activities/${id}/subtasks`),
  route("GET", `/v1/activities/${id}/subtasks/${otherId}`),
  route("PATCH", `/v1/activities/${id}/subtasks/${otherId}`),
  ...["archive", "restore"].map((action) =>
    route("POST", `/v1/activities/${id}/subtasks/${otherId}/${action}`),
  ),
  route("GET", "/v1/calendar-events"),
  route("GET", `/v1/calendar-events/${id}`),
  route("POST", "/v1/calendar-events"),
  route("PATCH", `/v1/calendar-events/${id}`),
  ...["archive", "restore"].map((action) => route("POST", `/v1/calendar-events/${id}/${action}`)),
  route("GET", "/v1/availability-rules"),
  route("POST", "/v1/availability-rules"),
  route("PATCH", `/v1/availability-rules/${id}`),
  ...["archive", "restore"].map((action) =>
    route("POST", `/v1/availability-rules/${id}/${action}`),
  ),
  route("GET", "/v1/availability-exceptions?from=2026-10-05&through=2026-10-12"),
  route("PUT", `/v1/availability-exceptions/${date}`),
  route("GET", "/v1/availability/capacity?from=2026-10-05&through=2026-10-12"),
  route("POST", "/v1/plans/preview"),
  route("GET", "/v1/risk-assessments?from=2026-10-05&through=2026-10-12"),
  route("GET", "/v1/plans/active"),
  route("GET", "/v1/plans/history"),
  route("GET", `/v1/plans/${id}`),
  route("PATCH", `/v1/plans/${id}/blocks/${otherId}`),
  route("DELETE", `/v1/plans/${id}/blocks/${otherId}`),
  ...["apply", "reject"].map((action) => route("POST", `/v1/plans/${id}/${action}`)),
  route("GET", "/v1/time-entries"),
  route("GET", "/v1/time-entries/active"),
  route("GET", "/v1/time-entries/statistics?from=2026-10-05&through=2026-10-12"),
  route("POST", "/v1/time-entries/start"),
  route("POST", `/v1/time-entries/${id}/stop`),
  route("POST", "/v1/time-entries/manual"),
  route("GET", "/v1/notifications"),
  route("POST", `/v1/notifications/${id}/read`),
  ...Object.keys(aiCases).map((useCase) => route("POST", `/v1/ai/${useCase}/suggestions`)),
  ...adminRoutes,
];

let processHandle: ReturnType<typeof Bun.spawn> | null = null;
let baseUrl = "";
let cookie = "";
let otherCookie = "";
let ownerUserId = "";

async function request(item: Route, sessionCookie?: string) {
  const response = await fetch(`${baseUrl}${item.path}`, {
    method: item.method,
    headers: {
      "content-type": "application/json",
      origin: baseUrl,
      ...(sessionCookie ? { cookie: sessionCookie } : {}),
    },
    body: item.method === "GET" ? undefined : "{}",
    signal: AbortSignal.timeout(5000),
  });
  return {
    status: response.status,
    type: response.headers.get("content-type"),
    body: (await response.json()) as { code?: string; status?: number },
  };
}

beforeAll(async () => {
  const verified = await pool.query<DatabaseTargetIdentity>(databaseTargetIdentitySql);
  if (!verified.rows[0]) throw new Error("Security test database could not be identified");
  assertApprovedLocalDatabase(verified.rows[0], "notesia_dev", process.env);
  const reservation = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(null, { status: 503 }),
  });
  const port = reservation.port;
  await reservation.stop();
  baseUrl = `http://127.0.0.1:${port}`;
  processHandle = Bun.spawn([process.execPath, "apps/api/src/index.ts"], {
    cwd: join(import.meta.dir, "../../.."),
    env: {
      ...process.env,
      PORT: String(port),
      BETTER_AUTH_URL: baseUrl,
      BETTER_AUTH_SECRET:
        crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""),
      ALLOW_SIGNUP: "true",
      NODE_ENV: "test",
      SMTP_HOST: "smtp.example.test",
      SMTP_FROM: "access@example.test",
    },
    stdout: "ignore",
    stderr: "ignore",
  });
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (processHandle.exitCode !== null) throw new Error("API exited during security test setup");
    try {
      const response = await fetch(`${baseUrl}/v1/ready`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // The API may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error("API did not become ready for security tests");
  const register = async (accountEmail: string) => {
    const registration = await fetch(`${baseUrl}/v1/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl },
      body: JSON.stringify({
        name: "Seguridad",
        email: accountEmail,
        password: "SecurityIntegration2026!",
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (registration.status !== 200)
      throw new Error(`Synthetic account registration returned HTTP ${registration.status}`);
    await pool.query(
      "UPDATE autenticacion.usuarios SET correo_verificado = true WHERE correo = $1",
      [accountEmail],
    );
    const signIn = await fetch(`${baseUrl}/v1/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl },
      body: JSON.stringify({ email: accountEmail, password: "SecurityIntegration2026!" }),
      signal: AbortSignal.timeout(5000),
    });
    const sessionCookie = signIn.headers.get("set-cookie")?.split(";")[0] ?? "";
    if (signIn.status !== 200 || !sessionCookie)
      throw new Error(`Synthetic account sign-in returned HTTP ${signIn.status}`);
    return sessionCookie;
  };
  cookie = await register(email);
  otherCookie = await register(otherEmail);
  const owner = await pool.query<{ id: string }>(
    "SELECT id FROM autenticacion.usuarios WHERE correo = $1",
    [email],
  );
  ownerUserId = owner.rows[0]?.id ?? "";
  if (!ownerUserId) throw new Error("Synthetic owner account was not persisted");
});

afterAll(async () => {
  try {
    for (const sessionCookie of [cookie, otherCookie])
      if (sessionCookie)
        await fetch(`${baseUrl}/v1/auth/sign-out`, {
          method: "POST",
          headers: { cookie: sessionCookie, origin: baseUrl },
          signal: AbortSignal.timeout(3000),
        }).catch(() => {});
    await pool.query("DELETE FROM autenticacion.usuarios WHERE correo IN ($1,$2)", [
      email,
      otherEmail,
    ]);
  } finally {
    try {
      if (processHandle) {
        const child = processHandle;
        const force = setTimeout(() => child.kill("SIGKILL"), 5000);
        try {
          if (child.exitCode === null) child.kill("SIGTERM");
          await child.exited;
        } finally {
          clearTimeout(force);
        }
      }
    } finally {
      await pool.end();
    }
  }
});

test("every private route rejects a request without a session", async () => {
  expect(privateRoutes.length).toBeGreaterThan(90);
  for (const item of privateRoutes) {
    const result = await request(item);
    expect([item.method, item.path, result.status, result.body.code]).toEqual([
      item.method,
      item.path,
      401,
      "AUTH_REQUIRED",
    ]);
    expect(result.type).toContain("application/problem+json");
    expect(result.body.status).toBe(401);
  }
  const publicDocuments = await fetch(`${baseUrl}/v1/privacy/documents`);
  expect(publicDocuments.status).toBe(200);
});

test("a student session cannot call administrative routes", async () => {
  for (const item of adminRoutes) {
    const result = await request(item, cookie);
    expect([item.method, item.path, result.status, result.body.code]).toEqual([
      item.method,
      item.path,
      403,
      "FORBIDDEN",
    ]);
    expect(result.type).toContain("application/problem+json");
  }
  const privateList = await fetch(`${baseUrl}/v1/subjects`, {
    headers: { cookie },
  });
  expect(privateList.status).toBe(200);
  expect(privateList.headers.get("cache-control")).toBe("no-store");
  expect(privateList.headers.get("x-content-type-options")).toBe("nosniff");
  const anonymousList = await fetch(`${baseUrl}/v1/subjects`);
  expect(anonymousList.status).toBe(401);
  expect(anonymousList.headers.get("cache-control")).toBe("no-store");
  expect(anonymousList.headers.get("x-content-type-options")).toBe("nosniff");
});

test("another account cannot read or change owned work, notices or devices", async () => {
  const subjectId = crypto.randomUUID();
  const activityId = crypto.randomUUID();
  const noticeId = crypto.randomUUID();
  const deviceId = crypto.randomUUID();
  const deadline = new Date(Date.now() + 2 * 86400000);
  await pool.query(
    `INSERT INTO dominio.materias (id, usuario_id, nombre, color)
     VALUES ($1,$2,'Materia privada','primary')`,
    [subjectId, ownerUserId],
  );
  await pool.query(
    `INSERT INTO dominio.actividades
       (id, usuario_id, materia_id, tipo, titulo, prioridad, fecha_limite, minutos_estimados)
     VALUES ($1,$2,$3,'academic_task','Informe privado','medium',$4,60)`,
    [activityId, ownerUserId, subjectId, deadline],
  );
  await pool.query(
    `INSERT INTO dominio.notificaciones
       (id, usuario_id, tipo, actividad_id, referencia_en)
     VALUES ($1,$2,'deadline_reminder',$3,$4)`,
    [noticeId, ownerUserId, activityId, deadline],
  );

  const ownedSubject = await fetch(`${baseUrl}/v1/subjects/${subjectId}`, {
    headers: { cookie },
  });
  expect(ownedSubject.status).toBe(200);
  expect((await ownedSubject.json()) as { name: string }).toMatchObject({
    name: "Materia privada",
  });
  expect(
    (await fetch(`${baseUrl}/v1/subjects/${subjectId}`, { headers: { cookie: otherCookie } }))
      .status,
  ).toBe(404);
  const foreignSubjectUpdate = await fetch(`${baseUrl}/v1/subjects/${subjectId}`, {
    method: "PATCH",
    headers: { cookie: otherCookie, "content-type": "application/json" },
    body: JSON.stringify({
      name: "Intento ajeno",
      colorToken: "primary",
      version: 1,
    }),
  });
  expect(foreignSubjectUpdate.status).toBe(404);
  const foreignActivities = await fetch(`${baseUrl}/v1/activities`, {
    headers: { cookie: otherCookie },
  });
  expect((await foreignActivities.json()) as { items: unknown[] }).toMatchObject({ items: [] });
  for (const path of [`/v1/activities/${activityId}`, `/v1/activities/${activityId}/history`])
    expect((await fetch(`${baseUrl}${path}`, { headers: { cookie: otherCookie } })).status).toBe(
      404,
    );
  const foreignDelete = await fetch(`${baseUrl}/v1/activities/${activityId}`, {
    method: "DELETE",
    headers: { cookie: otherCookie, "content-type": "application/json" },
    body: JSON.stringify({ version: 1, mutationId: crypto.randomUUID() }),
  });
  expect(foreignDelete.status).toBe(404);
  expect(
    (await fetch(`${baseUrl}/v1/activities/${activityId}`, { headers: { cookie } })).status,
  ).toBe(200);

  const ownerNotices = await fetch(`${baseUrl}/v1/notifications`, { headers: { cookie } });
  expect((await ownerNotices.json()) as { items: Array<{ id: string }> }).toMatchObject({
    items: [{ id: noticeId }],
  });
  const otherNotices = await fetch(`${baseUrl}/v1/notifications`, {
    headers: { cookie: otherCookie },
  });
  expect((await otherNotices.json()) as { items: unknown[] }).toMatchObject({ items: [] });
  const foreignRead = await fetch(`${baseUrl}/v1/notifications/${noticeId}/read`, {
    method: "POST",
    headers: { cookie: otherCookie, "content-type": "application/json" },
    body: JSON.stringify({ version: 1 }),
  });
  expect(foreignRead.status).toBe(404);

  const token = `test-push-${crypto.randomUUID()}`;
  const registeredDevice = await fetch(`${baseUrl}/v1/me/push-devices`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      id: deviceId,
      platform: "android",
      token,
    }),
  });
  expect(registeredDevice.status).toBe(503);
  expect(JSON.stringify(await registeredDevice.json())).not.toContain(token);
  const foreignDevices = await fetch(`${baseUrl}/v1/me/push-devices`, {
    headers: { cookie: otherCookie },
  });
  expect(await foreignDevices.json()).toEqual([]);
  expect(
    (
      await fetch(`${baseUrl}/v1/me/push-devices/${deviceId}`, {
        method: "DELETE",
        headers: { cookie: otherCookie },
      })
    ).status,
  ).toBe(404);
  const ownerDevices = await fetch(`${baseUrl}/v1/me/push-devices`, { headers: { cookie } });
  expect(await ownerDevices.json()).toEqual([]);
});
