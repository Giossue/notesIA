import { afterAll, expect, test } from "bun:test";
import {
  createActivityRepository,
  createAvailabilityRepository,
  createCalendarEventRepository,
  createProfileRepository,
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
  throw new Error("Availability integration tests only run against local notesia_dev credentials");
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
const events = createCalendarEventRepository(pool);
const availability = createAvailabilityRepository(pool);
const app = createApp(
  async () => {},
  auth.handler,
  { getSession, profiles },
  undefined,
  { getSession, activities: createActivityRepository(pool), profiles },
  undefined,
  { getSession, events, profiles },
  { getSession, availability, events, profiles },
);
const emailA = `availability-a-${crypto.randomUUID()}@example.test`;
const emailB = `availability-b-${crypto.randomUUID()}@example.test`;
let cookieA = "";
let cookieB = "";

async function register(email: string) {
  const response = await app.request("/v1/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
    body: JSON.stringify({ name: "Estudiante", email, password: "AvailabilityIntegration2026!" }),
  });
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}
function headers(cookie: string) {
  return { cookie, "content-type": "application/json" };
}
async function json(path: string, cookie: string) {
  return (await app.request(path, { headers: { cookie } })).json();
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

test("availability is private, versioned and capacity subtracts fixed events", async () => {
  expect((await app.request("/v1/availability-rules")).status).toBe(401);
  expect(
    (await app.request("/v1/availability/capacity?from=2026-09-28&through=2026-09-30")).status,
  ).toBe(401);
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
  const ruleId = crypto.randomUUID();
  const rule = { id: ruleId, weekday: 1, startMinute: 1320, endMinute: 1560 };
  const create = await app.request("/v1/availability-rules", {
    method: "POST",
    headers: headers(cookieA),
    body: JSON.stringify(rule),
  });
  expect(create.status).toBe(201);
  expect(
    (
      await app.request("/v1/availability-rules", {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify(rule),
      })
    ).status,
  ).toBe(200);
  expect(await json("/v1/availability-rules", cookieB)).toMatchObject({ items: [] });
  expect(
    (
      await app.request(`/v1/availability-rules/${ruleId}`, {
        method: "PATCH",
        headers: headers(cookieB),
        body: JSON.stringify({ weekday: 1, startMinute: 1200, endMinute: 1440, version: 1 }),
      })
    ).status,
  ).toBe(404);

  const eventId = crypto.randomUUID();
  expect(
    (
      await app.request("/v1/calendar-events", {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify({
          id: eventId,
          subjectId: null,
          kind: "class",
          title: "Clase",
          description: null,
          startsAt: "2026-09-29T05:30:00.000Z",
          endsAt: "2026-09-29T06:00:00.000Z",
          timeZone: "America/Guayaquil",
        }),
      })
    ).status,
  ).toBe(201);
  const capacity = await app.request(
    "/v1/availability/capacity?from=2026-09-28&through=2026-09-30",
    { headers: { cookie: cookieA } },
  );
  expect(capacity.status).toBe(200);
  expect(await capacity.json()).toMatchObject({
    totalMinutes: 210,
    daily: [
      { date: "2026-09-28", availableMinutes: 120 },
      { date: "2026-09-29", availableMinutes: 90 },
    ],
  });
  const otherCapacity = await app.request(
    "/v1/availability/capacity?from=2026-09-28&through=2026-09-30",
    { headers: { cookie: cookieB } },
  );
  expect(await otherCapacity.json()).toMatchObject({ totalMinutes: 0 });

  const exception = await app.request("/v1/availability-exceptions/2026-09-29", {
    method: "PUT",
    headers: headers(cookieA),
    body: JSON.stringify({ version: null, windows: [] }),
  });
  expect(exception.status).toBe(201);
  expect(await exception.json()).toMatchObject({ date: "2026-09-29", windows: [], version: 1 });
  expect(
    (
      await app.request("/v1/availability-exceptions/2026-09-29", {
        method: "PUT",
        headers: headers(cookieA),
        body: JSON.stringify({ version: null, windows: [] }),
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await app.request("/v1/availability-exceptions/2026-09-29", {
        method: "PUT",
        headers: headers(cookieA),
        body: JSON.stringify({
          version: 1,
          windows: [
            { startMinute: 600, endMinute: 660 },
            { startMinute: 650, endMinute: 700 },
          ],
        }),
      })
    ).status,
  ).toBe(422);
  const replaced = await app.request("/v1/availability-exceptions/2026-09-29", {
    method: "PUT",
    headers: headers(cookieA),
    body: JSON.stringify({ version: 1, windows: [] }),
  });
  expect(replaced.status).toBe(200);
  expect(await replaced.json()).toMatchObject({ version: 2 });
  expect(
    await json("/v1/availability/capacity?from=2026-09-28&through=2026-09-30", cookieA),
  ).toMatchObject({ totalMinutes: 120 });
  expect(
    await json("/v1/availability-exceptions?from=2026-09-28&through=2026-09-30", cookieB),
  ).toEqual({ items: [] });
  expect(
    (
      await app.request("/v1/availability/capacity?from=2026-09-28&through=2026-10-31", {
        headers: { cookie: cookieA },
      })
    ).status,
  ).toBe(422);

  const eventRange = await app.request("/v1/calendar-events?from=2026-09-28&through=2026-09-30", {
    headers: { cookie: cookieA },
  });
  expect((await eventRange.json()) as { items: Array<{ id: string }> }).toMatchObject({
    items: [{ id: eventId }],
  });
  expect(
    await json("/v1/calendar-events?from=2026-09-28&through=2026-09-30", cookieB),
  ).toMatchObject({ items: [] });
  const activityId = crypto.randomUUID();
  expect(
    (
      await app.request("/v1/activities", {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify({
          id: activityId,
          subjectId: null,
          kind: "academic_task",
          title: "Informe",
          description: null,
          priority: "medium",
          startAfterAt: null,
          deadlineAt: "2026-09-29T12:00:00.000Z",
          estimatedMinutes: 60,
        }),
      })
    ).status,
  ).toBe(201);
  expect(
    await json("/v1/activities?dueFrom=2026-09-28&dueThrough=2026-09-30", cookieA),
  ).toMatchObject({ items: [{ id: activityId }] });
});
