import { afterAll, expect, test } from "bun:test";
import { createAcademicPeriodRepository, createSubjectRepository } from "@notesia/db";
import { createApp } from "../../app";
import { createAuth } from "../../auth/create-auth";

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("DATABASE_URL is required for local integration tests");
const testUrl = new URL(sourceUrl);
if (
  !["127.0.0.1", "localhost", "::1"].includes(testUrl.hostname) ||
  testUrl.pathname !== "/notesia_dev"
) {
  throw new Error("Period integration tests only run against local notesia_dev credentials");
}
const { auth, pool } = createAuth({
  databaseUrl: testUrl.toString(),
  secret: crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""),
  baseURL: "http://127.0.0.1:3000",
  allowSignUp: true,
  allowUnverifiedEmailForTests: true,
});
const getSession = (headers: Headers) => auth.api.getSession({ headers });
const app = createApp(
  async () => {},
  auth.handler,
  undefined,
  { getSession, subjects: createSubjectRepository(pool) },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  { getSession, periods: createAcademicPeriodRepository(pool) },
);
const emailA = `periods-a-${crypto.randomUUID()}@example.test`;
const emailB = `periods-b-${crypto.randomUUID()}@example.test`;
let cookieA = "";
let cookieB = "";
const headers = (cookie: string) => ({ cookie, "content-type": "application/json" });

async function register(email: string) {
  const response = await app.request("/v1/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
    body: JSON.stringify({ name: "Estudiante", email, password: "PeriodIntegrationPassword2026!" }),
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

test("academic periods are private, versioned and optional on subjects", async () => {
  expect((await app.request("/v1/academic-periods")).status).toBe(401);
  cookieA = await register(emailA);
  cookieB = await register(emailB);
  const periodId = crypto.randomUUID();
  const period = { id: periodId, name: "2026 II", startsOn: "2026-09-01", endsOn: "2027-01-31" };
  const created = await app.request("/v1/academic-periods", {
    method: "POST",
    headers: headers(cookieA),
    body: JSON.stringify(period),
  });
  expect(created.status).toBe(201);
  expect(await created.json()).toMatchObject({ ...period, version: 1 });
  expect(
    (
      await app.request("/v1/academic-periods", {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify(period),
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await app.request(`/v1/academic-periods/${periodId}`, {
        headers: { cookie: cookieB },
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await app.request("/v1/academic-periods", {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify({ ...period, id: crypto.randomUUID(), endsOn: "2026-08-31" }),
      })
    ).status,
  ).toBe(422);
  const subjectId = crypto.randomUUID();
  const subject = { id: subjectId, periodId, name: "Cálculo", colorToken: "primary" };
  expect(
    (
      await app.request("/v1/subjects", {
        method: "POST",
        headers: headers(cookieB),
        body: JSON.stringify({ ...subject, id: crypto.randomUUID() }),
      })
    ).status,
  ).toBe(422);
  const linked = await app.request("/v1/subjects", {
    method: "POST",
    headers: headers(cookieA),
    body: JSON.stringify(subject),
  });
  expect(linked.status).toBe(201);
  expect(await linked.json()).toMatchObject({ periodId });
  expect(
    (
      await app.request(`/v1/academic-periods/${periodId}`, {
        method: "PATCH",
        headers: headers(cookieB),
        body: JSON.stringify({
          name: "Otro",
          startsOn: period.startsOn,
          endsOn: period.endsOn,
          version: 1,
        }),
      })
    ).status,
  ).toBe(404);
  const archived = await app.request(`/v1/academic-periods/${periodId}/archive`, {
    method: "POST",
    headers: headers(cookieA),
    body: JSON.stringify({ version: 1 }),
  });
  expect(archived.status).toBe(200);
  expect(await archived.json()).toMatchObject({ version: 2 });
  expect(
    (
      await app.request(`/v1/academic-periods/${periodId}/archive`, {
        method: "POST",
        headers: headers(cookieA),
        body: JSON.stringify({ version: 1 }),
      })
    ).status,
  ).toBe(409);
  expect(
    await (
      await app.request("/v1/academic-periods", {
        headers: { cookie: cookieA },
      })
    ).json(),
  ).toEqual({ items: [], nextCursor: null });
  expect(
    await (
      await app.request("/v1/academic-periods?archived=true", {
        headers: { cookie: cookieA },
      })
    ).json(),
  ).toMatchObject({ items: [{ id: periodId }] });
});
