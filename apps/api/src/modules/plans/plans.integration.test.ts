import { afterAll, expect, test } from "bun:test";
import {
  createActivityRepository,
  createAiContextRepository,
  createAiRepository,
  createAvailabilityRepository,
  createCalendarEventRepository,
  createNotificationPreferenceRepository,
  createNotificationRepository,
  createNotificationSchedulerRepository,
  createOutboxRepository,
  createPlanRepository,
  createPreferenceRepository,
  createProfileRepository,
  createPushDeliveryRepository,
  createPushDeviceRepository,
  createPushTokenCipher,
  createTimeEntryRepository,
} from "@notesia/db";
import { currentTraceContext } from "@notesia/observability";
import { createApp } from "../../app";
import { createAuth } from "../../auth/create-auth";
import { createAiGateway } from "../ai/gateway";

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("DATABASE_URL is required for local integration tests");
const testUrl = new URL(sourceUrl);
if (
  !["127.0.0.1", "localhost", "::1"].includes(testUrl.hostname) ||
  testUrl.pathname !== "/notesia_dev"
) {
  throw new Error("Plan integration tests only run against local notesia_dev credentials");
}
const { auth, pool } = createAuth({
  databaseUrl: testUrl.toString(),
  secret: crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""),
  baseURL: "http://127.0.0.1:3000",
  allowSignUp: true,
  allowUnverifiedEmailForTests: true,
});
const getSession = (headers: Headers) => auth.api.getSession({ headers });
const profiles = createProfileRepository(pool);
const activities = createActivityRepository(pool);
const availability = createAvailabilityRepository(pool);
const events = createCalendarEventRepository(pool);
const plans = createPlanRepository(pool);
const timeEntries = createTimeEntryRepository(pool);
const outbox = createOutboxRepository(pool);
const scheduler = createNotificationSchedulerRepository(pool);
const pushCipher = createPushTokenCipher(
  Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64"),
);
const pushDeliveries = createPushDeliveryRepository(pool, pushCipher);
const app = createApp(
  async () => {},
  auth.handler,
  { getSession, profiles, preferences: createPreferenceRepository(pool) },
  undefined,
  { getSession, activities, profiles },
  undefined,
  { getSession, events, profiles },
  { getSession, availability, events, profiles },
  {
    getSession,
    plans,
    preferences: createPreferenceRepository(pool),
    timeEntries,
    activities,
    availability,
    events,
    profiles,
    now: () => new Date("2026-09-24T12:00:00.000Z"),
  },
  {
    getSession,
    timeEntries,
    activities,
    profiles,
    now: () => new Date("2026-09-24T12:00:00.000Z"),
  },
  undefined,
  undefined,
  {
    getSession,
    notifications: createNotificationRepository(pool),
    preferences: createNotificationPreferenceRepository(pool),
  },
  undefined,
  undefined,
  {
    getSession,
    gateway: createAiGateway(createAiRepository(pool), null),
    context: createAiContextRepository(pool),
  },
  undefined,
  { getSession, devices: createPushDeviceRepository(pool), cipher: pushCipher },
);
const emailA = `plans-a-${crypto.randomUUID()}@example.test`;
const emailB = `plans-b-${crypto.randomUUID()}@example.test`;
const emailC = `plans-progress-${crypto.randomUUID()}@example.test`;
let cookieA = "";
let cookieB = "";
let cookieC = "";
const headers = (cookie: string) => ({ cookie, "content-type": "application/json" });

async function register(email: string) {
  const response = await app.request("/v1/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
    body: JSON.stringify({ name: "Estudiante", email, password: "PlanIntegrationPassword2026!" }),
  });
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}
afterAll(async () => {
  for (const cookie of [cookieA, cookieB, cookieC]) {
    if (cookie)
      await app.request("/v1/auth/sign-out", {
        method: "POST",
        headers: { cookie, origin: "http://127.0.0.1:3000" },
      });
  }
  await pool.query("DELETE FROM autenticacion.usuarios WHERE correo IN ($1,$2,$3)", [
    emailA,
    emailB,
    emailC,
  ]);
  await pool.end();
});

test("progress and logged time reduce planned work without double deduction", async () => {
  cookieC = await register(emailC);
  expect(
    (
      await app.request("/v1/me/profile", {
        method: "PATCH",
        headers: headers(cookieC),
        body: JSON.stringify({
          displayName: "Estudiante",
          language: "es",
          timeZone: "America/Guayaquil",
          version: 1,
        }),
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await app.request("/v1/availability-rules", {
        method: "POST",
        headers: headers(cookieC),
        body: JSON.stringify({
          id: crypto.randomUUID(),
          weekday: 1,
          startMinute: 540,
          endMinute: 720,
        }),
      })
    ).status,
  ).toBe(201);
  const activityId = crypto.randomUUID();
  expect(
    (
      await app.request("/v1/activities", {
        method: "POST",
        headers: headers(cookieC),
        body: JSON.stringify({
          id: activityId,
          subjectId: null,
          kind: "academic_task",
          title: "Informe",
          description: null,
          priority: "medium",
          startAfterAt: null,
          deadlineAt: "2026-10-07T17:00:00.000Z",
          estimatedMinutes: 120,
        }),
      })
    ).status,
  ).toBe(201);
  expect(
    (
      await app.request(`/v1/activities/${activityId}/progress`, {
        method: "PATCH",
        headers: headers(cookieC),
        body: JSON.stringify({ version: 1, mutationId: crypto.randomUUID(), progressPercent: 50 }),
      })
    ).status,
  ).toBe(200);
  const riskPath = "/v1/risk-assessments?from=2026-10-05&through=2026-10-08";
  expect((await app.request(riskPath)).status).toBe(401);
  expect(
    (
      await app.request("/v1/risk-assessments?from=2026-10-05&through=2026-10-05", {
        headers: { cookie: cookieC },
      })
    ).status,
  ).toBe(422);
  const risk = async () => app.request(riskPath, { headers: { cookie: cookieC } });
  const beforeRiskPlans = await pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM dominio.planes WHERE usuario_id = (SELECT id FROM autenticacion.usuarios WHERE correo = $1)",
    [emailC],
  );
  const afterProgressRisk = await risk();
  expect(afterProgressRisk.status).toBe(200);
  expect(afterProgressRisk.headers.get("cache-control")).toBe("no-store");
  expect(await afterProgressRisk.json()).toMatchObject({
    algorithmVersion: "deterministic-v2",
    timeZone: "America/Guayaquil",
    risk: [{ activityId, remainingMinutes: 60 }],
  });
  const afterRiskPlans = await pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM dominio.planes WHERE usuario_id = (SELECT id FROM autenticacion.usuarios WHERE correo = $1)",
    [emailC],
  );
  expect(afterRiskPlans.rows[0]?.count).toBe(beforeRiskPlans.rows[0]?.count);
  const preview = async () =>
    app.request("/v1/plans/preview", {
      method: "POST",
      headers: headers(cookieC),
      body: JSON.stringify({ id: crypto.randomUUID(), from: "2026-10-05", through: "2026-10-08" }),
    });
  const afterProgress = await preview();
  expect(afterProgress.status).toBe(201);
  const first = (await afterProgress.json()) as {
    blocks: Array<{ startsAt: string; endsAt: string }>;
    risk: Array<{ remainingMinutes: number }>;
  };
  expect(first.risk[0]?.remainingMinutes).toBe(60);
  expect(
    first.blocks.reduce(
      (sum, block) => sum + (Date.parse(block.endsAt) - Date.parse(block.startsAt)) / 60000,
      0,
    ),
  ).toBe(60);

  expect(
    (
      await app.request("/v1/time-entries/manual", {
        method: "POST",
        headers: headers(cookieC),
        body: JSON.stringify({
          id: crypto.randomUUID(),
          activityId,
          minutes: 90,
          endsAt: "2026-09-24T11:00:00.000Z",
        }),
      })
    ).status,
  ).toBe(201);
  const afterTime = await preview();
  expect(afterTime.status).toBe(201);
  expect(await (await risk()).json()).toMatchObject({
    risk: [{ activityId, remainingMinutes: 30 }],
  });
  const second = (await afterTime.json()) as {
    id: string;
    version: number;
    blocks: Array<{ id: string; startsAt: string; endsAt: string }>;
    risk: Array<{ remainingMinutes: number }>;
  };
  expect(second.risk[0]?.remainingMinutes).toBe(30);
  expect(
    second.blocks.reduce(
      (sum, block) => sum + (Date.parse(block.endsAt) - Date.parse(block.startsAt)) / 60000,
      0,
    ),
  ).toBe(30);
  const locked = await app.request(`/v1/plans/${second.id}/blocks/${second.blocks[0]?.id}`, {
    method: "PATCH",
    headers: headers(cookieC),
    body: JSON.stringify({
      startsAt: second.blocks[0]?.startsAt,
      endsAt: second.blocks[0]?.endsAt,
      isLocked: true,
      version: second.version,
    }),
  });
  expect(locked.status).toBe(200);
  expect(await locked.json()).toMatchObject({ blocks: [{ isLocked: true }] });
  expect(
    (
      await app.request(`/v1/plans/${second.id}/apply`, {
        method: "POST",
        headers: headers(cookieC),
        body: JSON.stringify({ version: second.version + 1 }),
      })
    ).status,
  ).toBe(200);
  const freshPlan = await app.request("/v1/plans/active", { headers: { cookie: cookieC } });
  expect(freshPlan.status).toBe(200);
  const freshStatus = (await freshPlan.json()) as {
    sourceRevision: string;
    currentSourceRevision: string;
    isStale: boolean;
  };
  expect(freshStatus.isStale).toBe(false);
  expect(freshStatus.sourceRevision).toBe(freshStatus.currentSourceRevision);
  const shorterRisk = await app.request("/v1/risk-assessments?from=2026-10-05&through=2026-10-07", {
    headers: { cookie: cookieC },
  });
  expect(shorterRisk.status).toBe(200);
  expect(await outbox.processOne()).toEqual({ kind: "delivered" });
  await pool.query("UPDATE dominio.riesgos_plan SET nivel = 'high' WHERE plan_id = $1", [
    second.id,
  ]);
  const firstAlertAt = new Date("2026-10-05T14:50:00.000Z");
  await Promise.all([scheduler.processDue(firstAlertAt), scheduler.processDue(firstAlertAt)]);
  const riskAlerts = async () => {
    const response = await app.request("/v1/notifications", { headers: { cookie: cookieC } });
    return ((await response.json()) as { items: Array<{ type: string }> }).items.filter(
      (item) => item.type === "risk_alert",
    );
  };
  expect(await riskAlerts()).toHaveLength(1);
  await scheduler.processDue(new Date("2026-10-05T14:51:00.000Z"));
  expect(await riskAlerts()).toHaveLength(1);
  await scheduler.processDue(new Date("2026-10-06T14:51:00.000Z"));
  expect(await riskAlerts()).toHaveLength(2);
  expect(
    (
      await app.request(`/v1/activities/${activityId}/progress`, {
        method: "PATCH",
        headers: headers(cookieC),
        body: JSON.stringify({ version: 2, mutationId: crypto.randomUUID(), progressPercent: 90 }),
      })
    ).status,
  ).toBe(200);
  expect(await (await risk()).json()).toMatchObject({
    risk: [{ activityId, remainingMinutes: 12, level: "high" }],
  });
  const stalePlan = await app.request("/v1/plans/active", { headers: { cookie: cookieC } });
  expect(stalePlan.headers.get("cache-control")).toBe("no-store");
  expect(await stalePlan.json()).toMatchObject({ isStale: true });
  await scheduler.processDue(new Date("2026-10-07T14:52:00.000Z"));
  expect(await riskAlerts()).toHaveLength(2);
  const deleted = await app.request(`/v1/activities/${activityId}`, {
    method: "DELETE",
    headers: headers(cookieC),
    body: JSON.stringify({ version: 3, mutationId: crypto.randomUUID() }),
  });
  expect(deleted.status).toBe(204);
  expect(await (await risk()).json()).toMatchObject({ risk: [], unscheduled: [] });
  await scheduler.processDue(new Date("2026-10-07T14:53:00.000Z"));
  expect(await riskAlerts()).toHaveLength(2);
});

test("preview, edit, apply and history require owner and fresh source revision", async () => {
  const input = {
    id: crypto.randomUUID(),
    from: "2026-10-05",
    through: "2026-10-07",
  };
  expect(
    (
      await app.request("/v1/plans/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      })
    ).status,
  ).toBe(401);
  cookieA = await register(emailA);
  cookieB = await register(emailB);
  const deviceId = crypto.randomUUID();
  const pushToken = `fcm-test-token-${crypto.randomUUID()}`;
  const registerDevice = await app.request("/v1/me/push-devices", {
    method: "POST",
    headers: headers(cookieA),
    body: JSON.stringify({ id: deviceId, platform: "android", token: pushToken }),
  });
  expect(registerDevice.status).toBe(200);
  expect(
    (
      await app.request(`/v1/me/push-devices/${deviceId}`, {
        method: "DELETE",
        headers: headers(cookieB),
      })
    ).status,
  ).toBe(404);
  const listedDevices = await app.request("/v1/me/push-devices", {
    headers: { cookie: cookieA },
  });
  const listedText = await listedDevices.text();
  expect(JSON.parse(listedText)).toMatchObject([{ id: deviceId, platform: "android" }]);
  expect(listedText).not.toContain(pushToken);
  expect(
    await (
      await app.request("/v1/me/push-devices", {
        headers: { cookie: cookieB },
      })
    ).json(),
  ).toEqual([]);
  const storedPush = await pool.query<{ encrypted: Buffer }>(
    `SELECT token_cifrado AS encrypted FROM dominio.dispositivos_push
     WHERE id = $1`,
    [deviceId],
  );
  expect(storedPush.rows[0]?.encrypted.toString()).not.toContain(pushToken);
  expect(
    (
      await app.request("/v1/me/profile", {
        method: "PATCH",
        headers: headers(cookieA),
        body: JSON.stringify({
          displayName: "Estudiante",
          language: "es",
          timeZone: "America/Guayaquil",
          version: 1,
        }),
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await app.request("/v1/availability-rules", {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify({
          id: crypto.randomUUID(),
          weekday: 1,
          startMinute: 540,
          endMinute: 720,
        }),
      })
    ).status,
  ).toBe(201);
  const activityId = crypto.randomUUID();
  const activity = {
    id: activityId,
    subjectId: null,
    kind: "academic_task",
    title: "Informe",
    description: null,
    priority: "high",
    startAfterAt: null,
    deadlineAt: "2026-10-05T16:00:00.000Z",
    estimatedMinutes: 60,
  };
  expect(
    (
      await app.request("/v1/activities", {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify(activity),
      })
    ).status,
  ).toBe(201);
  const otherRisk = await app.request("/v1/risk-assessments?from=2026-10-05&through=2026-10-07", {
    headers: { cookie: cookieB },
  });
  expect(otherRisk.status).toBe(200);
  expect(await otherRisk.json()).toMatchObject({ risk: [], unscheduled: [] });
  const preview = await app.request("/v1/plans/preview", {
    method: "POST",
    headers: headers(cookieA),
    body: JSON.stringify(input),
  });
  expect(preview.status).toBe(201);
  const draft = (await preview.json()) as {
    id: string;
    version: number;
    blocks: Array<{
      id: string;
      activityId: string;
      startsAt: string;
      endsAt: string;
      isLocked: boolean;
    }>;
    unscheduled: unknown[];
    risk: Array<{ level: string }>;
  };
  expect(draft).toMatchObject({
    id: input.id,
    algorithmVersion: "deterministic-v2",
    version: 1,
    unscheduled: [],
    minSessionMinutes: 25,
    maxSessionMinutes: 90,
    maxDailyMinutes: 240,
  });
  expect(draft.blocks).toHaveLength(1);
  expect(draft.blocks[0]).toMatchObject({
    activityId,
    startsAt: "2026-10-05T14:00:00.000Z",
    endsAt: "2026-10-05T15:00:00.000Z",
    isLocked: false,
  });
  expect(draft.risk).toHaveLength(1);
  const riskPath = "/v1/ai/explain_risk/suggestions";
  const riskRef = { planId: input.id, activityId };
  const explainRisk = (cookie: string, body: unknown) =>
    app.request(riskPath, {
      method: "POST",
      headers: headers(cookie),
      body: JSON.stringify(body),
    });
  expect((await explainRisk(cookieA, { level: "high", remainingMinutes: 1 })).status).toBe(422);
  expect((await explainRisk(cookieB, riskRef)).status).toBe(404);
  const ownerRisk = await explainRisk(cookieA, riskRef);
  expect(ownerRisk.status).toBe(403);
  expect(await ownerRisk.json()).toMatchObject({ code: "AI_CONSENT_REQUIRED" });
  const blockId = draft.blocks[0]?.id ?? "";
  expect(
    (await app.request(`/v1/plans/${input.id}`, { headers: { cookie: cookieB } })).status,
  ).toBe(404);
  expect(
    (
      await app.request(`/v1/plans/${input.id}/apply`, {
        method: "POST",
        headers: headers(cookieB),
        body: JSON.stringify({ version: 1 }),
      })
    ).status,
  ).toBe(404);
  const moved = await app.request(`/v1/plans/${input.id}/blocks/${blockId}`, {
    method: "PATCH",
    headers: headers(cookieA),
    body: JSON.stringify({
      startsAt: "2026-10-05T15:00:00.000Z",
      endsAt: "2026-10-05T16:00:00.000Z",
      isLocked: true,
      version: 1,
    }),
  });
  expect(moved.status).toBe(200);
  expect(await moved.json()).toMatchObject({
    version: 2,
    blocks: [{ isLocked: true, startsAt: "2026-10-05T15:00:00.000Z" }],
  });
  expect(
    (
      await app.request(`/v1/plans/${input.id}/apply`, {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify({ version: 1 }),
      })
    ).status,
  ).toBe(409);
  const apply = await app.request(`/v1/plans/${input.id}/apply`, {
    method: "POST",
    headers: headers(cookieA),
    body: JSON.stringify({ version: 2 }),
  });
  expect(apply.status).toBe(200);
  expect(await apply.json()).toMatchObject({ status: "active", version: 3 });
  const applyTrace = apply.headers.get("traceparent");
  expect(applyTrace).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  const [, applyTraceId, applySpanId] = applyTrace?.split("-") ?? [];
  if (!applyTraceId || !applySpanId) throw new Error("Missing apply trace context");
  const replayedApply = await app.request(`/v1/plans/${input.id}/apply`, {
    method: "POST",
    headers: headers(cookieA),
    body: JSON.stringify({ version: 2 }),
  });
  expect(replayedApply.status).toBe(200);
  expect(await replayedApply.json()).toMatchObject({ status: "active", version: 3 });
  const outboxRows = await pool.query<{ traceId: string; sourceSpanId: string }>(
    `SELECT traza_id AS "traceId", span_origen_id AS "sourceSpanId"
     FROM dominio.bandeja_salida WHERE plan_id = $1 AND tipo_evento = 'plan.applied'`,
    [input.id],
  );
  expect(outboxRows.rows).toHaveLength(1);
  expect(outboxRows.rows[0]).toMatchObject({ traceId: applyTraceId });
  expect(outboxRows.rows[0]?.sourceSpanId).toMatch(/^[0-9a-f]{16}$/);
  expect(outboxRows.rows[0]?.sourceSpanId).not.toBe(applySpanId);
  expect((await app.request("/v1/plans/active", { headers: { cookie: cookieB } })).status).toBe(
    404,
  );

  const nextInput = { ...input, id: crypto.randomUUID() };
  const next = await app.request("/v1/plans/preview", {
    method: "POST",
    headers: headers(cookieA),
    body: JSON.stringify(nextInput),
  });
  expect(next.status).toBe(201);
  expect(await next.json()).toMatchObject({
    blocks: [{ activityId, isLocked: true, startsAt: "2026-10-05T15:00:00.000Z" }],
  });
  const replanPath = "/v1/ai/explain_replan/suggestions";
  const explainReplan = (cookie: string, body: unknown) =>
    app.request(replanPath, {
      method: "POST",
      headers: headers(cookie),
      body: JSON.stringify(body),
    });
  expect((await explainReplan(cookieA, { movedBlocks: 999 })).status).toBe(422);
  expect((await explainReplan(cookieB, { planId: nextInput.id })).status).toBe(404);
  expect((await explainReplan(cookieA, { planId: nextInput.id })).status).toBe(403);
  expect(
    (
      await app.request(`/v1/plans/${nextInput.id}/apply`, {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify({ version: 1 }),
      })
    ).status,
  ).toBe(200);
  const history = await app.request("/v1/plans/history", { headers: { cookie: cookieA } });
  expect(history.status).toBe(200);
  expect(await history.json()).toMatchObject({
    items: [
      { id: nextInput.id, status: "active" },
      { id: input.id, status: "superseded" },
    ],
  });

  const removableId = crypto.randomUUID();
  const removablePreview = await app.request("/v1/plans/preview", {
    method: "POST",
    headers: headers(cookieA),
    body: JSON.stringify({ ...input, id: removableId }),
  });
  expect(removablePreview.status).toBe(201);
  const removable = (await removablePreview.json()) as {
    version: number;
    blocks: Array<{ id: string; startsAt: string; endsAt: string; isLocked: boolean }>;
  };
  const removableBlock = removable.blocks[0];
  expect(removableBlock?.isLocked).toBe(true);
  const removePath = `/v1/plans/${removableId}/blocks/${removableBlock?.id}`;
  const remove = (cookie: string, version: number) =>
    app.request(removePath, {
      method: "DELETE",
      headers: headers(cookie),
      body: JSON.stringify({ version }),
    });
  expect(
    (
      await app.request(removePath, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: 1 }),
      })
    ).status,
  ).toBe(401);
  expect((await remove(cookieB, 1)).status).toBe(404);
  expect((await remove(cookieA, 1)).status).toBe(409);
  const unlocked = await app.request(removePath, {
    method: "PATCH",
    headers: headers(cookieA),
    body: JSON.stringify({
      startsAt: removableBlock?.startsAt,
      endsAt: removableBlock?.endsAt,
      isLocked: false,
      version: 1,
    }),
  });
  expect(unlocked.status).toBe(200);
  expect(await unlocked.json()).toMatchObject({ version: 2, blocks: [{ isLocked: false }] });
  expect((await remove(cookieA, 1)).status).toBe(409);
  const removed = await remove(cookieA, 2);
  expect(removed.status).toBe(200);
  expect(await removed.json()).toMatchObject({
    version: 3,
    blocks: [],
    unscheduled: [{ activityId, minutes: 60 }],
  });
  expect(
    await (
      await app.request(`/v1/plans/${removableId}`, {
        headers: { cookie: cookieA },
      })
    ).json(),
  ).toMatchObject({ version: 3, blocks: [] });

  expect(await outbox.processOne()).toEqual({ kind: "delivered" });
  expect(await outbox.processOne()).toEqual({ kind: "delivered" });
  const pendingPush = await pool.query<{
    traceId: string;
    sourceSpanId: string;
    outboxTraceId: string;
    outboxSourceSpanId: string;
  }>(
    `SELECT push.traza_id AS "traceId", push.span_origen_id AS "sourceSpanId",
       outbox.traza_id AS "outboxTraceId", outbox.span_origen_id AS "outboxSourceSpanId"
     FROM dominio.envios_push push
     JOIN dominio.notificaciones notification ON notification.id = push.notificacion_id
     JOIN dominio.bandeja_salida outbox ON outbox.id = notification.evento_salida_id
     WHERE push.dispositivo_id = $1`,
    [deviceId],
  );
  expect(pendingPush.rows).toHaveLength(2);
  expect(
    pendingPush.rows.every(
      (row) =>
        row.traceId === row.outboxTraceId &&
        row.sourceSpanId !== row.outboxSourceSpanId &&
        /^[0-9a-f]{16}$/.test(row.sourceSpanId),
    ),
  ).toBe(true);
  const sentPush: string[] = [];
  const pushContexts: Array<{ traceId: string; parentSpanId: string | null }> = [];
  const sendPush = async (token: string) => {
    sentPush.push(token);
    const context = currentTraceContext();
    if (context) pushContexts.push(context);
    return "sent" as const;
  };
  expect(await pushDeliveries.processOne(sendPush, new Date("2026-09-24T15:00:00.000Z"))).toEqual({
    kind: "sent",
  });
  expect(await pushDeliveries.processOne(sendPush, new Date("2026-09-24T15:00:00.000Z"))).toEqual({
    kind: "sent",
  });
  expect(sentPush).toEqual([pushToken, pushToken]);
  expect(new Set(pushContexts.map((context) => context.traceId))).toEqual(
    new Set(pendingPush.rows.map((row) => row.traceId)),
  );
  expect(new Set(pushContexts.map((context) => context.parentSpanId))).toEqual(
    new Set(pendingPush.rows.map((row) => row.sourceSpanId)),
  );
  const notices = await app.request("/v1/notifications", { headers: { cookie: cookieA } });
  expect(notices.status).toBe(200);
  const noticePage = (await notices.json()) as {
    items: Array<{ id: string; planId: string; version: number; readAt: string | null }>;
  };
  expect(new Set(noticePage.items.map((item) => item.planId))).toEqual(
    new Set([input.id, nextInput.id]),
  );
  expect(
    await (
      await app.request("/v1/notifications", {
        headers: { cookie: cookieB },
      })
    ).json(),
  ).toMatchObject({ items: [] });
  const noticeId = noticePage.items[0]?.id ?? "";
  expect(
    (
      await app.request(`/v1/notifications/${noticeId}/read`, {
        method: "POST",
        headers: headers(cookieB),
        body: JSON.stringify({ version: 1 }),
      })
    ).status,
  ).toBe(404);
  const read = await app.request(`/v1/notifications/${noticeId}/read`, {
    method: "POST",
    headers: headers(cookieA),
    body: JSON.stringify({ version: 1 }),
  });
  expect(read.status).toBe(200);
  expect(await read.json()).toMatchObject({ version: 2 });
  expect(
    (
      await app.request(`/v1/notifications/${noticeId}/read`, {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify({ version: 1 }),
      })
    ).status,
  ).toBe(409);

  const noticePreferences = await app.request("/v1/me/notification-preferences", {
    headers: { cookie: cookieA },
  });
  expect(noticePreferences.status).toBe(200);
  expect(await noticePreferences.json()).toMatchObject({
    deadlineLeadMinutes: 1440,
    blockLeadMinutes: 15,
    riskCooldownMinutes: 1440,
    version: 1,
  });
  const preferenceUpdate = {
    deadlineLeadMinutes: 120,
    blockLeadMinutes: 15,
    riskCooldownMinutes: 1440,
    version: 1,
  };
  expect(
    (
      await app.request("/v1/me/notification-preferences", {
        method: "PATCH",
        headers: headers(cookieA),
        body: JSON.stringify(preferenceUpdate),
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await app.request("/v1/me/notification-preferences", {
        method: "PATCH",
        headers: headers(cookieA),
        body: JSON.stringify(preferenceUpdate),
      })
    ).status,
  ).toBe(409);
  expect(
    await (
      await app.request("/v1/me/notification-preferences", {
        headers: { cookie: cookieB },
      })
    ).json(),
  ).toMatchObject({ version: 1, deadlineLeadMinutes: 1440 });
  expect(await scheduler.processDue(new Date("2026-10-05T14:50:00.000Z"))).toBe(2);
  expect(await scheduler.processDue(new Date("2026-10-05T14:50:00.000Z"))).toBe(0);
  const reminders = (await (
    await app.request("/v1/notifications", {
      headers: { cookie: cookieA },
    })
  ).json()) as { items: Array<{ type: string; activityId: string | null }> };
  expect(reminders.items.filter((item) => item.type.endsWith("_reminder"))).toMatchObject([
    { activityId },
    { activityId },
  ]);
  await pool.query("UPDATE dominio.riesgos_plan SET nivel = 'high' WHERE plan_id = $1", [
    nextInput.id,
  ]);
  expect(await scheduler.processDue(new Date("2026-10-05T14:50:00.000Z"))).toBe(1);
  expect(await scheduler.processDue(new Date("2026-10-05T14:50:00.000Z"))).toBe(0);
  const riskNotices = (await (
    await app.request("/v1/notifications", {
      headers: { cookie: cookieA },
    })
  ).json()) as { items: Array<{ type: string; planId: string | null }> };
  expect(riskNotices.items).toContainEqual(
    expect.objectContaining({
      type: "risk_alert",
      planId: nextInput.id,
    }),
  );
  const queuedReminders = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM dominio.envios_push
     WHERE dispositivo_id = $1 AND estado = 'pending'`,
    [deviceId],
  );
  expect(Number(queuedReminders.rows[0]?.count)).toBe(3);
  const preferenceInput = {
    minSessionMinutes: 25,
    maxSessionMinutes: 90,
    maxDailyMinutes: 240,
    notificationsEnabled: true,
    quietStartMinute: 1320,
    quietEndMinute: 420,
  };
  const changeChannel = (
    pushNotificationsEnabled: boolean,
    notificationsEnabled: boolean,
    version: number,
  ) =>
    app.request("/v1/me/preferences", {
      method: "PATCH",
      headers: headers(cookieA),
      body: JSON.stringify({
        ...preferenceInput,
        pushNotificationsEnabled,
        notificationsEnabled,
        version,
      }),
    });
  expect((await changeChannel(false, true, 1)).status).toBe(200);
  expect(
    await (
      await app.request("/v1/plans/active", {
        headers: { cookie: cookieA },
      })
    ).json(),
  ).toMatchObject({ isStale: false });
  let calledWhileDisabled = false;
  expect(
    await pushDeliveries.processOne(async () => {
      calledWhileDisabled = true;
      return "sent";
    }, new Date("2026-09-24T15:00:00.000Z")),
  ).toEqual({ kind: "suppressed" });
  expect(calledWhileDisabled).toBe(false);
  expect((await changeChannel(true, true, 2)).status).toBe(200);
  expect(
    await pushDeliveries.processOne(
      async () => "unregistered",
      new Date("2026-09-24T15:00:00.000Z"),
    ),
  ).toEqual({ kind: "invalidated" });
  expect(
    await (
      await app.request("/v1/me/push-devices", {
        headers: { cookie: cookieA },
      })
    ).json(),
  ).toEqual([]);

  const staleInput = { ...input, id: crypto.randomUUID() };
  expect(
    (
      await app.request("/v1/plans/preview", {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify(staleInput),
      })
    ).status,
  ).toBe(201);
  expect(
    (
      await app.request(`/v1/activities/${activityId}`, {
        method: "PATCH",
        headers: headers(cookieA),
        body: JSON.stringify({
          subjectId: null,
          kind: "academic_task",
          title: "Informe revisado",
          description: null,
          priority: "high",
          startAfterAt: null,
          deadlineAt: "2026-10-05T16:00:00.000Z",
          estimatedMinutes: 60,
          version: 1,
        }),
      })
    ).status,
  ).toBe(200);
  const staleRisk = await explainRisk(cookieA, { planId: nextInput.id, activityId });
  expect(staleRisk.status).toBe(409);
  expect(await staleRisk.json()).toMatchObject({ code: "VERSION_CONFLICT" });
  expect(
    (
      await app.request(`/v1/plans/${staleInput.id}/apply`, {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify({ version: 1 }),
      })
    ).status,
  ).toBe(409);

  const quietDeviceId = crypto.randomUUID();
  expect(
    (
      await app.request("/v1/me/push-devices", {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify({
          id: quietDeviceId,
          platform: "android",
          token: `fcm-test-token-${crypto.randomUUID()}`,
        }),
      })
    ).status,
  ).toBe(200);
  expect((await changeChannel(false, true, 3)).status).toBe(200);
  const inboxOnlyId = crypto.randomUUID();
  const inboxOnlyPreview = await app.request("/v1/plans/preview", {
    method: "POST",
    headers: headers(cookieA),
    body: JSON.stringify({ ...input, id: inboxOnlyId }),
  });
  expect(inboxOnlyPreview.status).toBe(201);
  expect(
    (
      await app.request(`/v1/plans/${inboxOnlyId}/apply`, {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify({ version: 1 }),
      })
    ).status,
  ).toBe(200);
  expect(await outbox.processOne()).toEqual({ kind: "delivered" });
  const inboxOnly = await pool.query<{ notices: string; pushes: string }>(
    `SELECT count(DISTINCT n.id)::text AS notices, count(p.id)::text AS pushes
     FROM dominio.notificaciones n LEFT JOIN dominio.envios_push p
       ON p.notificacion_id = n.id
     WHERE n.plan_id = $1`,
    [inboxOnlyId],
  );
  expect(inboxOnly.rows[0]).toEqual({ notices: "1", pushes: "0" });

  expect((await changeChannel(false, false, 4)).status).toBe(200);
  const mutedId = crypto.randomUUID();
  expect(
    (
      await app.request("/v1/plans/preview", {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify({ ...input, id: mutedId }),
      })
    ).status,
  ).toBe(201);
  expect(
    (
      await app.request(`/v1/plans/${mutedId}/apply`, {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify({ version: 1 }),
      })
    ).status,
  ).toBe(200);
  expect(await outbox.processOne()).toEqual({ kind: "delivered" });
  const mutedNotices = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM dominio.notificaciones WHERE plan_id = $1`,
    [mutedId],
  );
  expect(mutedNotices.rows[0]?.count).toBe("0");
});
