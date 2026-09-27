import { afterAll, expect, test } from "bun:test";
import { createActivityRepository, createProfileRepository } from "@notesia/db";
import { createApp } from "../../app";
import { createAuth } from "../../auth/create-auth";

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("DATABASE_URL is required for local integration tests");
const testUrl = new URL(sourceUrl);
if (
  !["127.0.0.1", "localhost", "::1"].includes(testUrl.hostname) ||
  testUrl.pathname !== "/notesia_dev"
) {
  throw new Error("Activity integration tests only run against local notesia_dev credentials");
}

const { auth, pool } = createAuth({
  databaseUrl: testUrl.toString(),
  secret: crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""),
  baseURL: "http://127.0.0.1:3000",
  allowSignUp: true,
  allowUnverifiedEmailForTests: true,
});
const profiles = createProfileRepository(pool);
const activities = createActivityRepository(pool);
const getSession = (headers: Headers) => auth.api.getSession({ headers });
const app = createApp(
  async () => {},
  auth.handler,
  { getSession, profiles },
  { getSession, activities, profiles },
);

const emailA = `activity-a-${crypto.randomUUID()}@example.test`;
const emailB = `activity-b-${crypto.randomUUID()}@example.test`;
let cookieA = "";
let cookieB = "";

async function register(email: string) {
  const response = await app.request("/v1/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
    body: JSON.stringify({
      name: "Estudiante",
      email,
      password: "ActivityIntegrationPassword2026!",
    }),
  });
  expect(response.status).toBe(200);
  return {
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? "",
    userId: ((await response.json()) as { user: { id: string } }).user.id,
  };
}

function jsonHeaders(cookie: string) {
  return { cookie, "content-type": "application/json" };
}

afterAll(async () => {
  for (const cookie of [cookieA, cookieB]) {
    if (cookie)
      await app.request("/v1/auth/sign-out", {
        method: "POST",
        headers: { cookie, origin: "http://127.0.0.1:3000" },
      });
  }
  await pool.query("DELETE FROM autenticacion.usuarios WHERE correo IN ($1, $2)", [emailA, emailB]);
  await pool.end();
});

test("activities stay private, use profile time zone, and keep transition history", async () => {
  expect((await app.request("/v1/activities")).status).toBe(401);
  const a = await register(emailA);
  const b = await register(emailB);
  cookieA = a.cookie;
  cookieB = b.cookie;

  const profile = await app.request("/v1/me/profile", {
    method: "PATCH",
    headers: jsonHeaders(cookieA),
    body: JSON.stringify({
      displayName: "Estudiante",
      language: "es",
      timeZone: "America/Guayaquil",
      version: 1,
    }),
  });
  expect(profile.status).toBe(200);

  const id = crypto.randomUUID();
  const input = {
    id,
    kind: "academic_task",
    title: "Resolver ejercicios",
    description: "Capítulo 2",
    priority: "high",
    startAfterAt: "2026-09-23T20:00:00.000Z",
    deadlineAt: "2026-09-24T02:00:00.000Z",
    estimatedMinutes: 90,
  };
  const create = await app.request("/v1/activities", {
    method: "POST",
    headers: jsonHeaders(cookieA),
    body: JSON.stringify(input),
  });
  expect(create.status).toBe(201);
  expect(await create.json()).toMatchObject({
    id,
    status: "backlog",
    progressPercent: 0,
    version: 1,
  });

  const retry = await app.request("/v1/activities", {
    method: "POST",
    headers: jsonHeaders(cookieA),
    body: JSON.stringify(input),
  });
  expect(retry.status).toBe(200);

  const changedRetry = await app.request("/v1/activities", {
    method: "POST",
    headers: jsonHeaders(cookieA),
    body: JSON.stringify({ ...input, title: "Distinto" }),
  });
  expect(changedRetry.status).toBe(409);

  expect((await app.request(`/v1/activities/${id}`, { headers: { cookie: cookieB } })).status).toBe(
    404,
  );
  expect(
    (await app.request(`/v1/activities/${id}/history`, { headers: { cookie: cookieB } })).status,
  ).toBe(404);
  const otherList = await app.request("/v1/activities", { headers: { cookie: cookieB } });
  expect(await otherList.json()).toMatchObject({ items: [] });

  const invalidDates = await app.request("/v1/activities", {
    method: "POST",
    headers: jsonHeaders(cookieA),
    body: JSON.stringify({
      ...input,
      id: crypto.randomUUID(),
      startAfterAt: "2026-09-25T00:00:00.000Z",
    }),
  });
  expect(invalidDates.status).toBe(422);

  const dueToday = await app.request("/v1/activities?dueOn=2026-09-23", {
    headers: { cookie: cookieA },
  });
  expect(
    ((await dueToday.json()) as { items: Array<{ id: string }> }).items.map((row) => row.id),
  ).toContain(id);
  const dueTomorrow = await app.request("/v1/activities?dueOn=2026-09-24", {
    headers: { cookie: cookieA },
  });
  expect(((await dueTomorrow.json()) as { items: unknown[] }).items).toHaveLength(0);

  const update = await app.request(`/v1/activities/${id}`, {
    method: "PATCH",
    headers: jsonHeaders(cookieA),
    body: JSON.stringify({ ...input, id: undefined, title: "Resolver 20 ejercicios", version: 1 }),
  });
  expect(update.status).toBe(200);
  expect(await update.json()).toMatchObject({ title: "Resolver 20 ejercicios", version: 2 });
  const updateRetry = await app.request(`/v1/activities/${id}`, {
    method: "PATCH",
    headers: jsonHeaders(cookieA),
    body: JSON.stringify({ ...input, id: undefined, title: "Resolver 20 ejercicios", version: 1 }),
  });
  expect(updateRetry.status).toBe(200);
  expect(await updateRetry.json()).toMatchObject({ title: "Resolver 20 ejercicios", version: 2 });
  const stale = await app.request(`/v1/activities/${id}`, {
    method: "PATCH",
    headers: jsonHeaders(cookieA),
    body: JSON.stringify({ ...input, id: undefined, version: 1 }),
  });
  expect(stale.status).toBe(409);

  const mutationId = crypto.randomUUID();
  const complete = await app.request(`/v1/activities/${id}/complete`, {
    method: "POST",
    headers: jsonHeaders(cookieA),
    body: JSON.stringify({ version: 2, mutationId }),
  });
  expect(complete.status).toBe(200);
  expect(await complete.json()).toMatchObject({
    status: "completed",
    progressPercent: 100,
    version: 3,
  });
  const completeRetry = await app.request(`/v1/activities/${id}/complete`, {
    method: "POST",
    headers: jsonHeaders(cookieA),
    body: JSON.stringify({ version: 2, mutationId }),
  });
  expect(completeRetry.status).toBe(200);

  const history = await app.request(`/v1/activities/${id}/history`, {
    headers: { cookie: cookieA },
  });
  expect(((await history.json()) as { items: unknown[] }).items).toHaveLength(1);

  const reopen = await app.request(`/v1/activities/${id}/reopen`, {
    method: "POST",
    headers: jsonHeaders(cookieA),
    body: JSON.stringify({ version: 3, mutationId: crypto.randomUUID() }),
  });
  expect(reopen.status).toBe(200);
  expect(await reopen.json()).toMatchObject({
    status: "backlog",
    progressPercent: 0,
    version: 4,
    completedAt: null,
  });
  const afterReopen = await app.request(`/v1/activities/${id}/history`, {
    headers: { cookie: cookieA },
  });
  expect(((await afterReopen.json()) as { items: unknown[] }).items).toHaveLength(2);

  const progressBeforeCancel = await app.request(`/v1/activities/${id}/progress`, {
    method: "PATCH",
    headers: jsonHeaders(cookieA),
    body: JSON.stringify({ version: 4, mutationId: crypto.randomUUID(), progressPercent: 40 }),
  });
  expect(progressBeforeCancel.status).toBe(200);
  expect(await progressBeforeCancel.json()).toMatchObject({
    status: "in_progress",
    progressPercent: 40,
    version: 5,
  });

  const cancelMutationId = crypto.randomUUID();
  const cancel = () =>
    app.request(`/v1/activities/${id}/cancel`, {
      method: "POST",
      headers: jsonHeaders(cookieA),
      body: JSON.stringify({ version: 5, mutationId: cancelMutationId }),
    });
  expect(
    (
      await app.request(`/v1/activities/${id}/cancel`, {
        method: "POST",
        headers: jsonHeaders(cookieB),
        body: JSON.stringify({ version: 5, mutationId: crypto.randomUUID() }),
      })
    ).status,
  ).toBe(404);
  const cancelled = await cancel();
  expect(cancelled.status).toBe(200);
  expect(await cancelled.json()).toMatchObject({
    status: "cancelled",
    progressPercent: 40,
    version: 6,
  });
  expect((await cancel()).status).toBe(200);
  expect(
    (
      await app.request(`/v1/activities/${id}/cancel`, {
        method: "POST",
        headers: jsonHeaders(cookieA),
        body: JSON.stringify({ version: 5, mutationId: crypto.randomUUID() }),
      })
    ).status,
  ).toBe(409);
  const reactivate = await app.request(`/v1/activities/${id}/reopen`, {
    method: "POST",
    headers: jsonHeaders(cookieA),
    body: JSON.stringify({ version: 6, mutationId: crypto.randomUUID() }),
  });
  expect(reactivate.status).toBe(200);
  expect(await reactivate.json()).toMatchObject({
    status: "in_progress",
    progressPercent: 40,
    version: 7,
  });
  const afterReactivate = await app.request(`/v1/activities/${id}/history`, {
    headers: { cookie: cookieA },
  });
  expect(((await afterReactivate.json()) as { items: unknown[] }).items).toHaveLength(5);

  // RF-15: pausar e iniciar cambian el estado sin tocar el avance.
  const pause = await app.request(`/v1/activities/${id}/pause`, {
    method: "POST",
    headers: jsonHeaders(cookieA),
    body: JSON.stringify({ version: 7, mutationId: crypto.randomUUID() }),
  });
  expect(await pause.json()).toMatchObject({ status: "backlog", progressPercent: 40, version: 8 });
  const start = await app.request(`/v1/activities/${id}/start`, {
    method: "POST",
    headers: jsonHeaders(cookieA),
    body: JSON.stringify({ version: 8, mutationId: crypto.randomUUID() }),
  });
  expect(await start.json()).toMatchObject({
    status: "in_progress",
    progressPercent: 40,
    version: 9,
  });
  const startAgain = await app.request(`/v1/activities/${id}/start`, {
    method: "POST",
    headers: jsonHeaders(cookieA),
    body: JSON.stringify({ version: 9, mutationId: crypto.randomUUID() }),
  });
  expect(startAgain.status).toBe(409);

  const archive = await app.request(`/v1/activities/${id}/archive`, {
    method: "POST",
    headers: jsonHeaders(cookieA),
    body: JSON.stringify({ version: 9 }),
  });
  expect(archive.status).toBe(200);
  expect(((await archive.json()) as { archivedAt: string | null }).archivedAt).not.toBeNull();
  const active = await app.request("/v1/activities", { headers: { cookie: cookieA } });
  expect(((await active.json()) as { items: unknown[] }).items).toHaveLength(0);
  const archived = await app.request("/v1/activities?archived=true", {
    headers: { cookie: cookieA },
  });
  expect(((await archived.json()) as { items: unknown[] }).items).toHaveLength(1);
  const restore = await app.request(`/v1/activities/${id}/restore`, {
    method: "POST",
    headers: jsonHeaders(cookieA),
    body: JSON.stringify({ version: 10 }),
  });
  expect(restore.status).toBe(200);

  await Promise.all(
    Array.from({ length: 21 }, (_, number) =>
      activities.create(a.userId, crypto.randomUUID(), {
        kind: "personal",
        title: `Actividad ${number}`,
        description: null,
        priority: "medium",
        startAfterAt: null,
        deadlineAt: null,
        estimatedMinutes: null,
      }),
    ),
  );
  const firstPage = await app.request("/v1/activities", { headers: { cookie: cookieA } });
  const page1 = (await firstPage.json()) as {
    items: Array<{ id: string }>;
    nextCursor: string | null;
  };
  expect(page1.items).toHaveLength(20);
  expect(page1.nextCursor).toBeTruthy();
  const secondPage = await app.request(`/v1/activities?cursor=${page1.nextCursor}`, {
    headers: { cookie: cookieA },
  });
  const page2 = (await secondPage.json()) as {
    items: Array<{ id: string }>;
    nextCursor: string | null;
  };
  expect(page2.items).toHaveLength(2);
  expect(page2.nextCursor).toBeNull();
  expect(new Set([...page1.items, ...page2.items].map((row) => row.id)).size).toBe(22);

  const deletionPath = `/v1/activities/${id}`;
  const deletion = { version: 11, mutationId: crypto.randomUUID() };
  expect(
    (
      await app.request(deletionPath, {
        method: "DELETE",
        headers: jsonHeaders(cookieB),
        body: JSON.stringify(deletion),
      })
    ).status,
  ).toBe(404);
  expect((await app.request(deletionPath, { method: "DELETE" })).status).toBe(401);
  expect(
    (
      await app.request(deletionPath, {
        method: "DELETE",
        headers: jsonHeaders(cookieA),
        body: JSON.stringify({ version: 0, mutationId: deletion.mutationId }),
      })
    ).status,
  ).toBe(422);
  expect(
    (
      await app.request(deletionPath, {
        method: "DELETE",
        headers: jsonHeaders(cookieA),
        body: JSON.stringify({ ...deletion, version: 10 }),
      })
    ).status,
  ).toBe(409);
  const deleteActivity = () =>
    app.request(deletionPath, {
      method: "DELETE",
      headers: jsonHeaders(cookieA),
      body: JSON.stringify(deletion),
    });
  expect((await deleteActivity()).status).toBe(204);
  expect((await deleteActivity()).status).toBe(204);
  expect(
    (
      await app.request(deletionPath, {
        method: "DELETE",
        headers: jsonHeaders(cookieA),
        body: JSON.stringify({ ...deletion, mutationId: crypto.randomUUID() }),
      })
    ).status,
  ).toBe(404);
  expect((await app.request(deletionPath, { headers: { cookie: cookieA } })).status).toBe(404);
  const afterDelete = await app.request("/v1/activities", { headers: { cookie: cookieA } });
  expect(
    ((await afterDelete.json()) as { items: Array<{ id: string }> }).items.some(
      (row) => row.id === id,
    ),
  ).toBe(false);
  expect((await activities.listForPlanning(a.userId)).some((row) => row.id === id)).toBe(false);
  const deletedHistory = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM dominio.historial_actividades
     WHERE usuario_id = $1 AND actividad_id = $2 AND tipo_evento = 'deleted'`,
    [a.userId, id],
  );
  expect(deletedHistory.rows[0]?.count).toBe("1");
});

test("summary counts today, pending, in progress and overdue for the owner only", async () => {
  expect((await app.request("/v1/activities/summary")).status).toBe(401);
  const create = (deadlineAt: string | null) =>
    app.request("/v1/activities", {
      method: "POST",
      headers: jsonHeaders(cookieA),
      body: JSON.stringify({
        id: crypto.randomUUID(),
        kind: "academic_task",
        title: "Resumen",
        description: null,
        priority: "medium",
        startAfterAt: null,
        deadlineAt,
        estimatedMinutes: null,
      }),
    });
  const before = (await (
    await app.request("/v1/activities/summary", { headers: { cookie: cookieA } })
  ).json()) as { dueToday: number; pending: number; inProgress: number; overdue: number };

  const soon = new Date(Date.now() + 60_000).toISOString();
  expect((await create(new Date(Date.now() - 86_400_000).toISOString())).status).toBe(201);
  expect((await create(null)).status).toBe(201);
  const soonResponse = await create(soon);
  expect(soonResponse.status).toBe(201);

  const after = await app.request("/v1/activities/summary", { headers: { cookie: cookieA } });
  expect(after.status).toBe(200);
  const body = (await after.json()) as typeof before & { day: string };
  expect(body.pending).toBe(before.pending + 3);
  expect(body.overdue).toBe(before.overdue + 1);
  expect(body.inProgress).toBe(before.inProgress);
  expect(body.dueToday).toBeGreaterThanOrEqual(before.dueToday);

  const weekly = body as unknown as {
    week: { days: Array<{ date: string; completed: number; due: number }> };
    streakDays: number;
  };
  expect(weekly.week.days).toHaveLength(7);
  expect(weekly.week.days.map((row) => row.date)).toContain(body.day);
  expect(weekly.streakDays).toBeGreaterThanOrEqual(0);

  const other = await app.request("/v1/activities/summary", { headers: { cookie: cookieB } });
  const otherBody = (await other.json()) as {
    pending: number;
    week: { due: number };
  };
  expect(otherBody.pending).toBe(0);
  expect(otherBody.week.due).toBe(0);
  const ownStreak = await app.request("/v1/streak", { headers: { cookie: cookieA } });
  const otherStreak = await app.request("/v1/streak", { headers: { cookie: cookieB } });
  expect(ownStreak.status).toBe(200);
  expect(otherStreak.status).toBe(200);
  expect((await ownStreak.json()).todayRest).toBe(false);
  expect((await otherStreak.json()).todayRest).toBe(true);
});
