import { afterAll, expect, test } from "bun:test";
import {
  createActivityRepository,
  createAvailabilityRepository,
  createCalendarEventRepository,
  createPlanRepository,
  createPreferenceRepository,
  createProfileRepository,
  createTimeEntryRepository,
} from "@notesia/db";
import { createApp } from "../../app";
import { createAuth } from "../../auth/create-auth";

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("DATABASE_URL is required for local integration tests");
const testUrl = new URL(sourceUrl);
if (
  !["127.0.0.1", "localhost", "::1"].includes(testUrl.hostname) ||
  testUrl.pathname !== "/notesia_dev"
) {
  throw new Error("Time entry integration tests only run against local notesia_dev credentials");
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
const timeEntries = createTimeEntryRepository(pool);
let now = new Date("2026-09-24T12:00:00.000Z");
const app = createApp(
  async () => {},
  auth.handler,
  { getSession, profiles },
  { getSession, activities, profiles },
  undefined,
  { getSession, events, profiles },
  { getSession, availability, events, profiles },
  {
    getSession,
    plans: createPlanRepository(pool),
    preferences: createPreferenceRepository(pool),
    activities,
    availability,
    events,
    profiles,
    timeEntries,
    now: () => now,
  },
  { getSession, timeEntries, activities, profiles, now: () => now },
);
const emailA = `time-a-${crypto.randomUUID()}@example.test`;
const emailB = `time-b-${crypto.randomUUID()}@example.test`;
const emailC = `time-stats-${crypto.randomUUID()}@example.test`;
let cookieA = "";
let cookieB = "";
let cookieC = "";
const headers = (cookie: string) => ({ cookie, "content-type": "application/json" });

async function register(email: string) {
  const response = await app.request("/v1/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
    body: JSON.stringify({ name: "Estudiante", email, password: "TimeIntegrationPassword2026!" }),
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

test("weekly statistics include completed and overdue work even without logged time", async () => {
  cookieC = await register(emailC);
  now = new Date("2026-09-24T13:30:00.000Z");
  const cases = [
    { deadlineAt: "2026-09-24T11:00:00.000Z", completedAt: "2026-09-24T10:00:00.000Z" },
    { deadlineAt: "2026-09-23T11:00:00.000Z", completedAt: null },
    { deadlineAt: "2026-09-22T11:00:00.000Z", completedAt: "2026-09-24T12:00:00.000Z" },
    { deadlineAt: "2026-09-25T11:00:00.000Z", completedAt: null },
  ];
  for (const [index, activity] of cases.entries()) {
    const id = crypto.randomUUID();
    const created = await app.request("/v1/activities", {
      method: "POST",
      headers: headers(cookieC),
      body: JSON.stringify({
        id,
        kind: "academic_task",
        title: `Estadística ${index}`,
        description: null,
        priority: "medium",
        startAfterAt: null,
        deadlineAt: activity.deadlineAt,
        estimatedMinutes: 30,
      }),
    });
    expect(created.status).toBe(201);
    if (activity.completedAt) {
      const completed = await app.request(`/v1/activities/${id}/progress`, {
        method: "PATCH",
        headers: headers(cookieC),
        body: JSON.stringify({ version: 1, mutationId: crypto.randomUUID(), progressPercent: 100 }),
      });
      expect(completed.status).toBe(200);
      await pool.query(
        `UPDATE dominio.actividades SET completado_en = $2
         WHERE id = $1 AND usuario_id = (SELECT id FROM autenticacion.usuarios WHERE correo = $3)`,
        [id, activity.completedAt, emailC],
      );
    }
  }
  const path = "/v1/time-entries/statistics?from=2026-09-21&through=2026-09-28";
  expect((await app.request(path)).status).toBe(401);
  const response = await app.request(path, { headers: { cookie: cookieC } });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    totalSeconds: 0,
    activities: [],
    weeks: [
      {
        weekStart: "2026-09-21",
        seconds: 0,
        completedActivities: 2,
        dueActivities: 3,
        overdueActivities: 2,
        onTimeActivities: 1,
        onTimePercent: 33,
      },
    ],
  });
});

test("timer is single, server timed, private, retryable and reduces plan work", async () => {
  now = new Date("2026-09-24T12:00:00.000Z");
  expect((await app.request("/v1/time-entries/active")).status).toBe(401);
  cookieA = await register(emailA);
  cookieB = await register(emailB);
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
  const activityId = crypto.randomUUID();
  expect(
    (
      await app.request("/v1/activities", {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify({
          id: activityId,
          kind: "academic_task",
          title: "Tarea",
          description: null,
          priority: "high",
          startAfterAt: null,
          deadlineAt: "2026-09-28T17:00:00.000Z",
          estimatedMinutes: 180,
        }),
      })
    ).status,
  ).toBe(201);
  const sessionId = crypto.randomUUID();
  const start = await app.request("/v1/time-entries/start", {
    method: "POST",
    headers: headers(cookieA),
    body: JSON.stringify({ id: sessionId, activityId }),
  });
  expect(start.status).toBe(201);
  expect(await start.json()).toMatchObject({
    startsAt: "2026-09-24T12:00:00.000Z",
    endsAt: null,
    durationSeconds: null,
    version: 1,
  });
  expect(
    (
      await app.request("/v1/time-entries/start", {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify({ id: sessionId, activityId }),
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await app.request("/v1/time-entries/start", {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify({ id: crypto.randomUUID(), activityId }),
      })
    ).status,
  ).toBe(409);
  expect(
    await (
      await app.request("/v1/time-entries/active", {
        headers: { cookie: cookieB },
      })
    ).json(),
  ).toEqual({ item: null });
  const mutationId = crypto.randomUUID();
  now = new Date("2026-09-24T13:30:00.000Z");
  expect(
    (
      await app.request(`/v1/time-entries/${sessionId}/stop`, {
        method: "POST",
        headers: headers(cookieB),
        body: JSON.stringify({ version: 1, mutationId }),
      })
    ).status,
  ).toBe(404);
  const overlapsOpenTimer = await app.request("/v1/time-entries/manual", {
    method: "POST",
    headers: headers(cookieA),
    body: JSON.stringify({
      id: crypto.randomUUID(),
      activityId,
      minutes: 30,
      endsAt: "2026-09-24T13:00:00.000Z",
    }),
  });
  expect(overlapsOpenTimer.status).toBe(409);
  const stopped = await app.request(`/v1/time-entries/${sessionId}/stop`, {
    method: "POST",
    headers: headers(cookieA),
    body: JSON.stringify({ version: 1, mutationId }),
  });
  expect(stopped.status).toBe(200);
  expect(await stopped.json()).toMatchObject({ durationSeconds: 5400, version: 2 });
  expect(
    (
      await app.request(`/v1/time-entries/${sessionId}/stop`, {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify({ version: 1, mutationId }),
      })
    ).status,
  ).toBe(200);
  const manualId = crypto.randomUUID();
  const manual = { id: manualId, activityId, minutes: 30, endsAt: "2026-09-24T11:30:00.000Z" };
  const overlapsTimer = await app.request("/v1/time-entries/manual", {
    method: "POST",
    headers: headers(cookieA),
    body: JSON.stringify({
      id: crypto.randomUUID(),
      activityId,
      minutes: 30,
      endsAt: "2026-09-24T13:00:00.000Z",
    }),
  });
  expect(overlapsTimer.status).toBe(409);
  expect((await overlapsTimer.json()).code).toBe("SCHEDULE_CONFLICT");
  expect(
    (
      await app.request("/v1/time-entries/manual", {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify(manual),
      })
    ).status,
  ).toBe(201);
  expect(
    (
      await app.request("/v1/time-entries/manual", {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify(manual),
      })
    ).status,
  ).toBe(200);
  const overlapsManual = await app.request("/v1/time-entries/manual", {
    method: "POST",
    headers: headers(cookieA),
    body: JSON.stringify({
      id: crypto.randomUUID(),
      activityId,
      minutes: 30,
      endsAt: "2026-09-24T11:45:00.000Z",
    }),
  });
  expect(overlapsManual.status).toBe(409);
  const conflictingId = await app.request("/v1/time-entries/manual", {
    method: "POST",
    headers: headers(cookieA),
    body: JSON.stringify({ ...manual, minutes: 40 }),
  });
  expect(conflictingId.status).toBe(409);
  expect((await conflictingId.json()).code).toBe("VERSION_CONFLICT");
  expect(
    (
      await app.request("/v1/time-entries/manual", {
        method: "POST",
        headers: headers(cookieB),
        body: JSON.stringify({ ...manual, id: crypto.randomUUID() }),
      })
    ).status,
  ).toBe(404);
  const stats = await app.request(
    "/v1/time-entries/statistics?from=2026-09-24&through=2026-09-25",
    {
      headers: { cookie: cookieA },
    },
  );
  expect(stats.status).toBe(200);
  expect(await stats.json()).toMatchObject({
    totalSeconds: 7200,
    weeks: [{ weekStart: "2026-09-21", seconds: 7200 }],
    activities: [
      {
        activityId,
        title: "Tarea",
        estimatedMinutes: 180,
        actualSeconds: 7200,
      },
    ],
  });
  expect(
    await (
      await app.request("/v1/time-entries/statistics?from=2026-09-24&through=2026-09-25", {
        headers: { cookie: cookieB },
      })
    ).json(),
  ).toMatchObject({ totalSeconds: 0 });
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
  const preview = await app.request("/v1/plans/preview", {
    method: "POST",
    headers: headers(cookieA),
    body: JSON.stringify({
      id: crypto.randomUUID(),
      from: "2026-09-28",
      through: "2026-09-29",
      minSessionMinutes: 25,
      maxSessionMinutes: 90,
      maxDailyMinutes: 180,
    }),
  });
  expect(preview.status).toBe(201);
  const plan = (await preview.json()) as {
    blocks: Array<{ startsAt: string; endsAt: string }>;
    risk: Array<{ remainingMinutes: number }>;
  };
  expect(plan.risk[0]?.remainingMinutes).toBe(60);
  expect(plan.blocks).toHaveLength(1);
  expect(
    Date.parse(plan.blocks[0]?.endsAt ?? "") - Date.parse(plan.blocks[0]?.startsAt ?? ""),
  ).toBe(3600000);

  const progress = { progressPercent: 50, version: 1, mutationId: crypto.randomUUID() };
  expect(
    (
      await app.request(`/v1/activities/${activityId}/progress`, {
        method: "PATCH",
        headers: headers(cookieB),
        body: JSON.stringify(progress),
      })
    ).status,
  ).toBe(404);
  const partial = await app.request(`/v1/activities/${activityId}/progress`, {
    method: "PATCH",
    headers: headers(cookieA),
    body: JSON.stringify(progress),
  });
  expect(partial.status).toBe(200);
  expect(await partial.json()).toMatchObject({
    status: "in_progress",
    progressPercent: 50,
    version: 2,
  });
  expect(
    (
      await app.request(`/v1/activities/${activityId}/progress`, {
        method: "PATCH",
        headers: headers(cookieA),
        body: JSON.stringify(progress),
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await app.request(`/v1/activities/${activityId}/progress`, {
        method: "PATCH",
        headers: headers(cookieA),
        body: JSON.stringify({ ...progress, mutationId: crypto.randomUUID() }),
      })
    ).status,
  ).toBe(409);
  const completed = await app.request(`/v1/activities/${activityId}/progress`, {
    method: "PATCH",
    headers: headers(cookieA),
    body: JSON.stringify({ progressPercent: 100, version: 2, mutationId: crypto.randomUUID() }),
  });
  expect(completed.status).toBe(200);
  expect(await completed.json()).toMatchObject({
    status: "completed",
    progressPercent: 100,
    version: 3,
  });
  const history = await app.request(`/v1/activities/${activityId}/history`, {
    headers: { cookie: cookieA },
  });
  expect(await history.json()).toMatchObject({
    items: [
      { eventType: "progress_updated", beforeProgress: 50, afterProgress: 100 },
      { eventType: "progress_updated", beforeProgress: 0, afterProgress: 50 },
    ],
  });
});
