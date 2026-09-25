import { afterAll, expect, test } from "bun:test";
import {
  createActivityRepository,
  createProfileRepository,
  createSubtaskRepository,
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
  throw new Error("Subtask integration tests only run against local notesia_dev credentials");
}

const { auth, pool } = createAuth({
  databaseUrl: testUrl.toString(),
  secret: crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""),
  baseURL: "http://127.0.0.1:3000",
  allowSignUp: true,
  allowUnverifiedEmailForTests: true,
});
const activities = createActivityRepository(pool);
const getSession = (headers: Headers) => auth.api.getSession({ headers });
const app = createApp(
  async () => {},
  auth.handler,
  { getSession, profiles: createProfileRepository(pool) },
  { getSession, activities, profiles: createProfileRepository(pool) },
  { getSession, activities, subtasks: createSubtaskRepository(pool) },
);

const emailA = `subtask-a-${crypto.randomUUID()}@example.test`;
const emailB = `subtask-b-${crypto.randomUUID()}@example.test`;
let cookieA = "";
let cookieB = "";

async function register(email: string) {
  const response = await app.request("/v1/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
    body: JSON.stringify({
      name: "Estudiante",
      email,
      password: "SubtaskIntegrationPassword2026!",
    }),
  });
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

function headers(cookie: string) {
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

test("subtasks are private, ordered, versioned and retryable", async () => {
  const activityId = crypto.randomUUID();
  const base = `/v1/activities/${activityId}/subtasks`;
  expect((await app.request(base)).status).toBe(401);
  cookieA = await register(emailA);
  cookieB = await register(emailB);

  const parent = await app.request("/v1/activities", {
    method: "POST",
    headers: headers(cookieA),
    body: JSON.stringify({
      id: activityId,
      kind: "academic_task",
      title: "Preparar proyecto",
      description: null,
      priority: "medium",
      startAfterAt: null,
      deadlineAt: null,
      estimatedMinutes: 120,
    }),
  });
  expect(parent.status).toBe(201);

  const id = crypto.randomUUID();
  const createInput = { id, title: "Preparar índice", estimatedMinutes: 30 };
  const create = await app.request(base, {
    method: "POST",
    headers: headers(cookieA),
    body: JSON.stringify(createInput),
  });
  expect(create.status).toBe(201);
  expect(await create.json()).toMatchObject({ id, isCompleted: false, version: 1 });
  const retry = await app.request(base, {
    method: "POST",
    headers: headers(cookieA),
    body: JSON.stringify(createInput),
  });
  expect(retry.status).toBe(200);
  expect(
    (
      await app.request(base, {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify({ ...createInput, title: "Otra subtarea" }),
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await app.request(base, {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify({ ...createInput, id: crypto.randomUUID(), title: " " }),
      })
    ).status,
  ).toBe(422);

  expect((await app.request(base, { headers: { cookie: cookieB } })).status).toBe(404);
  expect((await app.request(`${base}/${id}`, { headers: { cookie: cookieB } })).status).toBe(404);
  expect(
    (
      await app.request(`${base}/${id}`, {
        method: "PATCH",
        headers: headers(cookieB),
        body: JSON.stringify({
          title: "Intento",
          estimatedMinutes: 30,
          isCompleted: true,
          version: 1,
          mutationId: crypto.randomUUID(),
        }),
      })
    ).status,
  ).toBe(404);

  const mutationId = crypto.randomUUID();
  const completeInput = {
    title: "Preparar índice",
    estimatedMinutes: 30,
    isCompleted: true,
    version: 1,
    mutationId,
  };
  const complete = await app.request(`${base}/${id}`, {
    method: "PATCH",
    headers: headers(cookieA),
    body: JSON.stringify(completeInput),
  });
  expect(complete.status).toBe(200);
  const completed = (await complete.json()) as { completedAt: string; version: number };
  expect(completed.completedAt).toBeTruthy();
  expect(completed.version).toBe(2);
  const completeRetry = await app.request(`${base}/${id}`, {
    method: "PATCH",
    headers: headers(cookieA),
    body: JSON.stringify(completeInput),
  });
  expect(completeRetry.status).toBe(200);
  expect(await completeRetry.json()).toMatchObject({
    version: 2,
    completedAt: completed.completedAt,
  });
  expect(
    (
      await app.request(`${base}/${id}`, {
        method: "PATCH",
        headers: headers(cookieA),
        body: JSON.stringify({ ...completeInput, mutationId: crypto.randomUUID() }),
      })
    ).status,
  ).toBe(409);

  const edit = await app.request(`${base}/${id}`, {
    method: "PATCH",
    headers: headers(cookieA),
    body: JSON.stringify({
      ...completeInput,
      title: "Índice terminado",
      version: 2,
      mutationId: crypto.randomUUID(),
    }),
  });
  expect(edit.status).toBe(200);
  expect(await edit.json()).toMatchObject({ completedAt: completed.completedAt, version: 3 });
  const reopen = await app.request(`${base}/${id}`, {
    method: "PATCH",
    headers: headers(cookieA),
    body: JSON.stringify({
      ...completeInput,
      title: "Índice terminado",
      isCompleted: false,
      version: 3,
      mutationId: crypto.randomUUID(),
    }),
  });
  expect(reopen.status).toBe(200);
  expect(await reopen.json()).toMatchObject({ isCompleted: false, completedAt: null, version: 4 });

  const archiveInput = { version: 4, mutationId: crypto.randomUUID() };
  const archive = await app.request(`${base}/${id}/archive`, {
    method: "POST",
    headers: headers(cookieA),
    body: JSON.stringify(archiveInput),
  });
  expect(archive.status).toBe(200);
  expect(await archive.json()).toMatchObject({ version: 5 });
  const archiveRetry = await app.request(`${base}/${id}/archive`, {
    method: "POST",
    headers: headers(cookieA),
    body: JSON.stringify(archiveInput),
  });
  expect(archiveRetry.status).toBe(200);
  const active = await app.request(base, { headers: { cookie: cookieA } });
  expect(((await active.json()) as { items: unknown[] }).items).toHaveLength(0);
  const archived = await app.request(`${base}?archived=true`, { headers: { cookie: cookieA } });
  expect(((await archived.json()) as { items: unknown[] }).items).toHaveLength(1);

  const restore = await app.request(`${base}/${id}/restore`, {
    method: "POST",
    headers: headers(cookieA),
    body: JSON.stringify({ version: 5, mutationId: crypto.randomUUID() }),
  });
  expect(restore.status).toBe(200);

  for (let index = 0; index < 21; index++) {
    const response = await app.request(base, {
      method: "POST",
      headers: headers(cookieA),
      body: JSON.stringify({
        id: crypto.randomUUID(),
        title: `Paso ${index}`,
        estimatedMinutes: null,
      }),
    });
    expect(response.status).toBe(201);
  }
  const first = await app.request(base, { headers: { cookie: cookieA } });
  const firstPage = (await first.json()) as {
    items: Array<{ id: string }>;
    nextCursor: string | null;
  };
  expect(firstPage.items).toHaveLength(20);
  expect(firstPage.nextCursor).toBeTruthy();
  const second = await app.request(
    `${base}?cursor=${encodeURIComponent(firstPage.nextCursor ?? "")}`,
    {
      headers: { cookie: cookieA },
    },
  );
  const secondPage = (await second.json()) as {
    items: Array<{ id: string }>;
    nextCursor: string | null;
  };
  expect(secondPage.items).toHaveLength(2);
  expect(secondPage.nextCursor).toBeNull();
  expect(new Set([...firstPage.items, ...secondPage.items].map((row) => row.id)).size).toBe(22);

  const parentArchived = await app.request(`/v1/activities/${activityId}/archive`, {
    method: "POST",
    headers: headers(cookieA),
    body: JSON.stringify({ version: 1 }),
  });
  expect(parentArchived.status).toBe(200);
  expect(
    (
      await app.request(base, {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify({
          id: crypto.randomUUID(),
          title: "Bloqueada",
          estimatedMinutes: null,
        }),
      })
    ).status,
  ).toBe(409);
});
