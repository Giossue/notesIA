import { afterAll, beforeAll, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertApprovedLocalDatabase,
  createActivityRepository,
  createAiContextRepository,
  createAiRepository,
  createAvailabilityRepository,
  createCalendarEventRepository,
  createNotificationPreferenceRepository,
  createNotificationRepository,
  createOutboxRepository,
  createPlanRepository,
  createPreferenceRepository,
  createPrivacyRepository,
  createProfileRepository,
  createSubjectRepository,
  createTimeEntryRepository,
  type DatabaseTargetIdentity,
  databaseTargetIdentitySql,
} from "@notesia/db";
import { Client, Pool } from "pg";
import { createApp } from "./app";
import { createAuth } from "./auth/create-auth";
import { createAiGateway } from "./modules/ai/gateway";

const source = process.env.DATABASE_URL;
if (!source) throw new Error("DATABASE_URL is required for backend flow tests");
const local = new URL(source);
if (
  !["127.0.0.1", "localhost", "::1"].includes(local.hostname) ||
  local.pathname !== "/notesia_dev"
)
  throw new Error("Backend flow tests require local notesia_dev credentials");

const testName = `notesia_flow_test_${crypto.randomUUID().replaceAll("-", "")}`;
const testUrl = new URL(local);
testUrl.pathname = `/${testName}`;
const admin = new Client({
  host: "127.0.0.1",
  port: Number(local.port || 5432),
  user: "postgres",
  database: "postgres",
});
const documentIds = {
  terms: crypto.randomUUID(),
  privacy: crypto.randomUUID(),
  ai: crypto.randomUUID(),
};
const fixedNow = new Date("2026-09-24T12:00:00.000Z");
let seed: Pool | undefined;
let runtime: Pool | undefined;
let app: ReturnType<typeof createApp>;
let outbox: ReturnType<typeof createOutboxRepository>;
let created = false;

beforeAll(async () => {
  await admin.connect();
  const target = await admin.query<DatabaseTargetIdentity>(databaseTargetIdentitySql);
  if (!target.rows[0]) throw new Error("Backend flow database could not be identified");
  assertApprovedLocalDatabase(target.rows[0], "postgres", process.env);
  await admin.query(`CREATE DATABASE "${testName}"`);
  created = true;
  seed = new Pool({ host: "127.0.0.1", port: 5432, user: "postgres", database: testName });
  const migrations = join(import.meta.dir, "../../../packages/db/migrations");
  for (const file of readdirSync(migrations)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort())
    await seed.query(readFileSync(join(migrations, file), "utf8"));
  await seed.query(
    `INSERT INTO dominio.documentos_privacidad
       (id, tipo, version, idioma, contenido, publicado_en)
     VALUES ($1, 'terms', 1, 'es', 'Términos sintéticos de prueba', now()),
            ($2, 'privacy', 1, 'es', 'Privacidad sintética de prueba', now()),
            ($3, 'ai', 1, 'es', 'IA sintética de prueba', now())`,
    [documentIds.terms, documentIds.privacy, documentIds.ai],
  );
  const auth = createAuth({
    databaseUrl: testUrl.toString(),
    secret: crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""),
    baseURL: "http://127.0.0.1:3000",
    allowSignUp: true,
    allowUnverifiedEmailForTests: true,
    rateLimitEnabled: false,
  });
  runtime = auth.pool;
  const getSession = (headers: Headers) => auth.auth.api.getSession({ headers });
  const profiles = createProfileRepository(runtime);
  const preferences = createPreferenceRepository(runtime);
  const activities = createActivityRepository(runtime);
  const availability = createAvailabilityRepository(runtime);
  const events = createCalendarEventRepository(runtime);
  const plans = createPlanRepository(runtime);
  const timeEntries = createTimeEntryRepository(runtime);
  const ai = createAiRepository(runtime);
  outbox = createOutboxRepository(runtime);
  app = createApp(
    async () => {},
    auth.auth.handler,
    { getSession, profiles, preferences },
    { getSession, subjects: createSubjectRepository(runtime) },
    { getSession, activities, profiles },
    undefined,
    undefined,
    { getSession, availability, events, profiles },
    {
      getSession,
      plans,
      preferences,
      timeEntries,
      activities,
      availability,
      events,
      profiles,
      now: () => fixedNow,
    },
    { getSession, timeEntries, activities, profiles, now: () => fixedNow },
    undefined,
    undefined,
    {
      getSession,
      notifications: createNotificationRepository(runtime),
      preferences: createNotificationPreferenceRepository(runtime),
    },
    { getSession, privacy: createPrivacyRepository(runtime) },
    undefined,
    { getSession, gateway: createAiGateway(ai, null), context: createAiContextRepository(runtime) },
  );
});

afterAll(async () => {
  await runtime?.end();
  await seed?.end();
  if (created) await admin.query(`DROP DATABASE "${testName}" WITH (FORCE)`);
  await admin.end();
});

test("a student can consent, plan, work, see risk, revoke AI and keep manual planning", async () => {
  const registration = await app.request("/v1/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
    body: JSON.stringify({
      name: "Estudiante",
      email: `flow-${crypto.randomUUID()}@example.test`,
      password: "BackendFlowPassword2026!",
    }),
  });
  expect(registration.status).toBe(200);
  const cookie = registration.headers.get("set-cookie")?.split(";")[0] ?? "";
  expect(cookie).toBeTruthy();
  const headers = { cookie, "content-type": "application/json" };
  const post = (path: string, body: unknown) =>
    app.request(path, { method: "POST", headers, body: JSON.stringify(body) });

  const documents = await app.request("/v1/privacy/documents?language=es");
  expect(documents.status).toBe(200);
  expect((await documents.json()) as unknown[]).toHaveLength(3);
  const aiPath = "/v1/ai/estimate_duration/suggestions";
  const suggestion = () => post(aiPath, { description: "Resolver ejercicios de cálculo" });
  expect((await suggestion()).status).toBe(403);
  for (const documentId of Object.values(documentIds)) {
    const consent = await post("/v1/me/consents", { documentId });
    expect(consent.status).toBe(200);
  }
  expect(await (await suggestion()).json()).toEqual({ kind: "manual", reason: "not_configured" });

  const profile = await app.request("/v1/me/profile", {
    method: "PATCH",
    headers,
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
      await post("/v1/subjects", {
        id: subjectId,
        name: "Cálculo",
        colorToken: "primary",
      })
    ).status,
  ).toBe(201);
  const activityId = crypto.randomUUID();
  expect(
    (
      await post("/v1/activities", {
        id: activityId,
        subjectId,
        kind: "academic_task",
        title: "Resolver ejercicios",
        description: null,
        priority: "high",
        startAfterAt: null,
        deadlineAt: "2026-09-28T18:00:00.000Z",
        estimatedMinutes: 120,
      })
    ).status,
  ).toBe(201);
  expect(
    (
      await post("/v1/availability-rules", {
        id: crypto.randomUUID(),
        weekday: 1,
        startMinute: 540,
        endMinute: 720,
      })
    ).status,
  ).toBe(201);

  const preview = await post("/v1/plans/preview", {
    id: crypto.randomUUID(),
    from: "2026-09-28",
    through: "2026-09-29",
  });
  expect(preview.status).toBe(201);
  const draft = (await preview.json()) as {
    id: string;
    version: number;
    blocks: Array<{ activityId: string; startsAt: string; endsAt: string }>;
    unscheduled: unknown[];
  };
  expect(draft.blocks).toHaveLength(2);
  expect(draft.unscheduled).toEqual([]);
  expect(draft.blocks.every((block) => block.activityId === activityId)).toBe(true);
  expect(
    draft.blocks.reduce(
      (minutes, block) => minutes + (Date.parse(block.endsAt) - Date.parse(block.startsAt)) / 60000,
      0,
    ),
  ).toBe(120);
  const apply = await post(`/v1/plans/${draft.id}/apply`, { version: draft.version });
  expect(apply.status).toBe(200);
  expect(await outbox.processOne()).toEqual({ kind: "delivered" });
  const notices = await app.request("/v1/notifications", { headers: { cookie } });
  expect(notices.status).toBe(200);
  expect(await notices.json()).toMatchObject({
    items: [{ type: "plan_applied", planId: draft.id }],
  });
  const foreignRegistration = await app.request("/v1/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
    body: JSON.stringify({
      name: "Otra estudiante",
      email: `flow-other-${crypto.randomUUID()}@example.test`,
      password: "BackendFlowPassword2026!",
    }),
  });
  expect(foreignRegistration.status).toBe(200);
  const foreignCookie = foreignRegistration.headers.get("set-cookie")?.split(";")[0] ?? "";
  expect(
    (await app.request(`/v1/plans/${draft.id}`, { headers: { cookie: foreignCookie } })).status,
  ).toBe(404);
  expect(
    (await app.request(`/v1/subjects/${subjectId}`, { headers: { cookie: foreignCookie } })).status,
  ).toBe(404);
  expect(
    await (await app.request("/v1/notifications", { headers: { cookie: foreignCookie } })).json(),
  ).toMatchObject({ items: [] });

  const manual = await post("/v1/time-entries/manual", {
    id: crypto.randomUUID(),
    activityId,
    minutes: 30,
    endsAt: "2026-09-24T11:00:00.000Z",
  });
  expect(manual.status).toBe(201);
  const statistics = await app.request(
    "/v1/time-entries/statistics?from=2026-09-24&through=2026-09-25",
    { headers: { cookie } },
  );
  expect(statistics.status).toBe(200);
  expect(await statistics.json()).toMatchObject({ totalSeconds: 1800 });
  const risk = await app.request("/v1/risk-assessments?from=2026-09-28&through=2026-09-29", {
    headers: { cookie },
  });
  expect(risk.status).toBe(200);
  expect(await risk.json()).toMatchObject({ risk: [{ activityId, remainingMinutes: 90 }] });

  const revoked = await post("/v1/me/consents/ai/revoke", {});
  expect(revoked.status).toBe(200);
  expect((await revoked.json()).decision).toBe("revoked");
  expect((await suggestion()).status).toBe(403);
  const manualPreview = await post("/v1/plans/preview", {
    id: crypto.randomUUID(),
    from: "2026-09-28",
    through: "2026-09-29",
  });
  expect(manualPreview.status).toBe(201);
  expect(await manualPreview.json()).toMatchObject({ risk: [{ remainingMinutes: 90 }] });
});
