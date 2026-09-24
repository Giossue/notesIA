import { afterAll, expect, test } from "bun:test";
import {
  createActivityRepository,
  createCalendarEventRepository,
  createProfileRepository,
  createSubjectRepository,
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
  throw new Error("Calendar integration tests only run against local notesia_dev credentials");
}

const { auth, pool } = createAuth({
  databaseUrl: testUrl.toString(),
  secret: crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""),
  baseURL: "http://127.0.0.1:3000",
  allowSignUp: true,
});
const profiles = createProfileRepository(pool);
const events = createCalendarEventRepository(pool);
const getSession = (headers: Headers) => auth.api.getSession({ headers });
const app = createApp(
  async () => {},
  auth.handler,
  { getSession, profiles },
  { getSession, subjects: createSubjectRepository(pool) },
  { getSession, activities: createActivityRepository(pool), profiles },
  undefined,
  { getSession, events, profiles },
);

const emailA = `calendar-a-${crypto.randomUUID()}@example.test`;
const emailB = `calendar-b-${crypto.randomUUID()}@example.test`;
let cookieA = "";
let cookieB = "";

async function register(email: string) {
  const response = await app.request("/v1/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
    body: JSON.stringify({
      name: "Estudiante",
      email,
      password: "CalendarIntegrationPassword2026!",
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

test("fixed events are private, versioned and appear on each overlapping local day", async () => {
  expect((await app.request("/v1/calendar-events")).status).toBe(401);
  cookieA = await register(emailA);
  cookieB = await register(emailB);

  const profile = await app.request("/v1/me/profile", {
    method: "PATCH",
    headers: headers(cookieA),
    body: JSON.stringify({
      displayName: "Estudiante",
      language: "es",
      timeZone: "America/Guayaquil",
      version: 1,
    }),
  });
  expect(profile.status).toBe(200);

  const subjectId = crypto.randomUUID();
  expect(
    (
      await app.request("/v1/subjects", {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify({ id: subjectId, name: "Cálculo", code: null, colorToken: "primary" }),
      })
    ).status,
  ).toBe(201);

  const id = crypto.randomUUID();
  const input = {
    id,
    subjectId,
    kind: "class",
    title: "Clase nocturna",
    description: null,
    startsAt: "2026-09-24T03:00:00.000Z",
    endsAt: "2026-09-24T06:00:00.000Z",
    timeZone: "America/Guayaquil",
  };
  const { id: _clientId, ...eventFields } = input;
  const create = await app.request("/v1/calendar-events", {
    method: "POST",
    headers: headers(cookieA),
    body: JSON.stringify(input),
  });
  expect(create.status).toBe(201);
  expect(await create.json()).toMatchObject({ id, isLocked: true, source: "manual", version: 1 });
  expect(
    (
      await app.request("/v1/calendar-events", {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify(input),
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await app.request("/v1/calendar-events", {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify({ ...input, title: "Conflicto" }),
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await app.request("/v1/calendar-events", {
        method: "POST",
        headers: headers(cookieB),
        body: JSON.stringify({ ...input, id: crypto.randomUUID() }),
      })
    ).status,
  ).toBe(422);
  expect(
    (await app.request(`/v1/calendar-events/${id}`, { headers: { cookie: cookieB } })).status,
  ).toBe(404);
  expect(
    (
      await app.request(`/v1/calendar-events/${id}`, {
        method: "PATCH",
        headers: headers(cookieB),
        body: JSON.stringify({ ...eventFields, version: 1, mutationId: crypto.randomUUID() }),
      })
    ).status,
  ).toBe(404);

  const badDates = await app.request("/v1/calendar-events", {
    method: "POST",
    headers: headers(cookieA),
    body: JSON.stringify({ ...input, id: crypto.randomUUID(), endsAt: input.startsAt }),
  });
  expect(badDates.status).toBe(422);
  const badZone = await app.request("/v1/calendar-events", {
    method: "POST",
    headers: headers(cookieA),
    body: JSON.stringify({ ...input, id: crypto.randomUUID(), timeZone: "Invalid/Zone" }),
  });
  expect(badZone.status).toBe(422);

  for (const day of ["2026-09-23", "2026-09-24"]) {
    const response = await app.request(`/v1/calendar-events?on=${day}`, {
      headers: { cookie: cookieA },
    });
    expect(response.status).toBe(200);
    expect(
      ((await response.json()) as { items: Array<{ id: string }> }).items.map((row) => row.id),
    ).toContain(id);
  }
  const nextDay = await app.request("/v1/calendar-events?on=2026-09-25", {
    headers: { cookie: cookieA },
  });
  expect(((await nextDay.json()) as { items: unknown[] }).items).toHaveLength(0);
  expect(
    (
      await app.request("/v1/calendar-events?on=2026-09-24&archived=true", {
        headers: { cookie: cookieA },
      })
    ).status,
  ).toBe(422);

  const mutationId = crypto.randomUUID();
  const updateInput = { ...eventFields, title: "Clase extendida", version: 1, mutationId };
  const update = await app.request(`/v1/calendar-events/${id}`, {
    method: "PATCH",
    headers: headers(cookieA),
    body: JSON.stringify(updateInput),
  });
  expect(update.status).toBe(200);
  expect(await update.json()).toMatchObject({ title: "Clase extendida", version: 2 });
  const updateRetry = await app.request(`/v1/calendar-events/${id}`, {
    method: "PATCH",
    headers: headers(cookieA),
    body: JSON.stringify(updateInput),
  });
  expect(updateRetry.status).toBe(200);
  expect(await updateRetry.json()).toMatchObject({ version: 2 });
  expect(
    (
      await app.request(`/v1/calendar-events/${id}`, {
        method: "PATCH",
        headers: headers(cookieA),
        body: JSON.stringify({ ...updateInput, mutationId: crypto.randomUUID() }),
      })
    ).status,
  ).toBe(409);

  const archiveInput = { version: 2, mutationId: crypto.randomUUID() };
  expect(
    (
      await app.request(`/v1/calendar-events/${id}/archive`, {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify(archiveInput),
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await app.request(`/v1/calendar-events/${id}/archive`, {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify(archiveInput),
      })
    ).status,
  ).toBe(200);
  const hidden = await app.request("/v1/calendar-events?on=2026-09-24", {
    headers: { cookie: cookieA },
  });
  expect(((await hidden.json()) as { items: unknown[] }).items).toHaveLength(0);
  expect(
    (
      await app.request(`/v1/calendar-events/${id}/restore`, {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify({ version: 3, mutationId: crypto.randomUUID() }),
      })
    ).status,
  ).toBe(200);

  for (let index = 0; index < 21; index++) {
    const start = new Date(Date.UTC(2026, 8, 24, 10, index)).toISOString();
    const end = new Date(Date.UTC(2026, 8, 24, 10, index + 1)).toISOString();
    const response = await app.request("/v1/calendar-events", {
      method: "POST",
      headers: headers(cookieA),
      body: JSON.stringify({
        ...input,
        id: crypto.randomUUID(),
        subjectId: null,
        title: `Evento ${index}`,
        startsAt: start,
        endsAt: end,
      }),
    });
    expect(response.status).toBe(201);
  }
  const first = await app.request("/v1/calendar-events?on=2026-09-24", {
    headers: { cookie: cookieA },
  });
  const firstPage = (await first.json()) as {
    items: Array<{ id: string; startsAt: string }>;
    nextCursor: string | null;
  };
  expect(firstPage.items).toHaveLength(20);
  expect(firstPage.items[0]?.id).toBe(id);
  expect(firstPage.nextCursor).toBeTruthy();
  const second = await app.request(
    `/v1/calendar-events?on=2026-09-24&cursor=${encodeURIComponent(firstPage.nextCursor ?? "")}`,
    { headers: { cookie: cookieA } },
  );
  const secondPage = (await second.json()) as {
    items: Array<{ id: string }>;
    nextCursor: string | null;
  };
  expect(secondPage.items).toHaveLength(2);
  expect(secondPage.nextCursor).toBeNull();
  expect(new Set([...firstPage.items, ...secondPage.items].map((row) => row.id)).size).toBe(22);
});
