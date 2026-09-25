import { afterAll, beforeAll, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createAccountExportRepository,
  createActivityRepository,
  createActivitySeriesRepository,
  createProfileRepository,
  createSubjectRepository,
} from "@notesia/db";
import { Client, Pool } from "pg";
import { createApp } from "../../app";
import { createAuth } from "../../auth/create-auth";

const source = process.env.DATABASE_URL;
if (!source) throw new Error("DATABASE_URL is required for activity series integration tests");
const local = new URL(source);
if (
  !["127.0.0.1", "localhost", "::1"].includes(local.hostname) ||
  local.pathname !== "/notesia_dev"
)
  throw new Error("Activity series tests require local notesia_dev credentials");
const name = `notesia_series_test_${crypto.randomUUID().replaceAll("-", "")}`;
const url = new URL(local);
url.pathname = `/${name}`;
const admin = new Client({
  host: "127.0.0.1",
  port: Number(local.port || 5432),
  user: "postgres",
  database: "postgres",
});
let seed: Pool;
let pool: Pool;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  seed = new Pool({
    host: "127.0.0.1",
    port: Number(local.port || 5432),
    user: "postgres",
    database: name,
  });
  const migrations = join(import.meta.dir, "../../../../../packages/db/migrations");
  for (const file of readdirSync(migrations)
    .filter((item) => /^\d{4}_.+\.sql$/.test(item))
    .sort())
    await seed.query(readFileSync(join(migrations, file), "utf8"));
  const created = createAuth({
    databaseUrl: url.toString(),
    secret: crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""),
    baseURL: "http://127.0.0.1:3000",
    allowSignUp: true,
    allowUnverifiedEmailForTests: true,
  });
  pool = created.pool;
  const getSession = (headers: Headers) => created.auth.api.getSession({ headers });
  const profiles = createProfileRepository(pool);
  const activities = createActivityRepository(pool);
  app = createApp(
    async () => {},
    created.auth.handler,
    { getSession, profiles },
    { getSession, subjects: createSubjectRepository(pool) },
    { getSession, activities, profiles },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { getSession, series: createActivitySeriesRepository(pool), profiles },
  );
});

afterAll(async () => {
  await pool?.end();
  await seed?.end();
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
});

async function register() {
  const response = await app.request("/v1/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
    body: JSON.stringify({
      name: "Estudiante",
      email: `${crypto.randomUUID()}@example.test`,
      password: "SeriesIntegrationPassword2026!",
    }),
  });
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}
const headers = (cookie: string) => ({ cookie, "content-type": "application/json" });

test("series generate scoped independent instances and replay safely", async () => {
  expect((await app.request("/v1/activity-series")).status).toBe(401);
  const a = await register();
  const b = await register();
  const profile = await app.request("/v1/me/profile", {
    method: "PATCH",
    headers: headers(a),
    body: JSON.stringify({
      displayName: "Estudiante",
      language: "es",
      timeZone: "America/New_York",
      version: 1,
    }),
  });
  expect(profile.status).toBe(200);
  const subjectId = crypto.randomUUID();
  expect(
    (
      await app.request("/v1/subjects", {
        method: "POST",
        headers: headers(a),
        body: JSON.stringify({ id: subjectId, name: "Cálculo", code: null, colorToken: "primary" }),
      })
    ).status,
  ).toBe(201);

  const id = crypto.randomUUID();
  const input = {
    id,
    subjectId,
    kind: "academic_task",
    title: "Repasar",
    description: null,
    priority: "medium",
    estimatedMinutes: 45,
    frequency: "daily",
    startOn: "2026-03-07",
    throughOn: "2026-03-09",
  };
  const create = await app.request("/v1/activity-series", {
    method: "POST",
    headers: headers(a),
    body: JSON.stringify(input),
  });
  expect(create.status).toBe(201);
  expect(await create.json()).toMatchObject({
    ...input,
    timeZone: "America/New_York",
    instanceCount: 3,
  });
  expect(
    (
      await app.request("/v1/activity-series", {
        method: "POST",
        headers: headers(a),
        body: JSON.stringify(input),
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await app.request("/v1/activity-series", {
        method: "POST",
        headers: headers(a),
        body: JSON.stringify({ ...input, title: "Otro" }),
      })
    ).status,
  ).toBe(409);
  expect((await app.request(`/v1/activity-series/${id}`, { headers: { cookie: b } })).status).toBe(
    404,
  );
  expect((await app.request("/v1/activity-series", { headers: { cookie: b } })).status).toBe(200);
  expect(
    (
      await app.request("/v1/activity-series", {
        method: "POST",
        headers: headers(b),
        body: JSON.stringify({ ...input, id: crypto.randomUUID() }),
      })
    ).status,
  ).toBe(422);

  const list = await app.request(`/v1/activities?seriesId=${id}`, { headers: { cookie: a } });
  expect(list.status).toBe(200);
  const items = (
    (await list.json()) as {
      items: Array<{ id: string; occursOn: string; deadlineAt: string; version: number }>;
    }
  ).items;
  expect(items.map((item) => item.occursOn).sort()).toEqual([
    "2026-03-07",
    "2026-03-08",
    "2026-03-09",
  ]);
  const dueOn = await app.request("/v1/activities?dueOn=2026-03-08", {
    headers: { cookie: a },
  });
  const dueItems = ((await dueOn.json()) as { items: Array<{ occursOn: string }> }).items;
  expect(dueItems.map((item) => item.occursOn)).toEqual(["2026-03-08"]);
  const foreignList = await app.request(`/v1/activities?seriesId=${id}`, {
    headers: { cookie: b },
  });
  expect(((await foreignList.json()) as { items: unknown[] }).items).toHaveLength(0);
  const middle = items.find((item) => item.occursOn === "2026-03-08");
  expect(middle).toBeDefined();
  const update = await app.request(`/v1/activities/${middle?.id}`, {
    method: "PATCH",
    headers: headers(a),
    body: JSON.stringify({
      subjectId,
      kind: "academic_task",
      title: "Repaso cambiado",
      description: null,
      priority: "medium",
      startAfterAt: "2026-03-08T05:00:00.000Z",
      deadlineAt: middle?.deadlineAt,
      estimatedMinutes: 45,
      version: middle?.version,
    }),
  });
  expect(update.status).toBe(200);
  const later = await app.request(`/v1/activities?seriesId=${id}`, { headers: { cookie: a } });
  const updated = ((await later.json()) as { items: Array<{ title: string }> }).items;
  expect(updated.filter((item) => item.title === "Repaso cambiado")).toHaveLength(1);

  expect(
    (
      await app.request("/v1/activity-series", {
        method: "POST",
        headers: headers(a),
        body: JSON.stringify({
          ...input,
          id: crypto.randomUUID(),
          startOn: "2026-01-01",
          throughOn: "2026-03-03",
        }),
      })
    ).status,
  ).toBe(422);
  const count = await seed.query<{ count: number }>(
    "select count(*)::integer as count from dominio.actividades where serie_id = $1",
    [id],
  );
  expect(count.rows[0]?.count).toBe(3);
  const owner = await seed.query<{ userId: string }>(
    `select usuario_id as "userId" from dominio.series_actividades where id = $1`,
    [id],
  );
  const exported = await createAccountExportRepository(pool).stream(owner.rows[0]?.userId ?? "");
  const exportBody = (await new Response(exported).json()) as {
    data: { activitySeries: Array<{ id: string }>; activities: Array<{ seriesId: string }> };
  };
  expect(exportBody.data.activitySeries.map((row) => row.id)).toContain(id);
  expect(exportBody.data.activities.filter((row) => row.seriesId === id)).toHaveLength(3);
  const changedZone = await app.request("/v1/me/profile", {
    method: "PATCH",
    headers: headers(a),
    body: JSON.stringify({
      displayName: "Estudiante",
      language: "es",
      timeZone: "America/Guayaquil",
      version: 2,
    }),
  });
  expect(changedZone.status).toBe(200);
  const afterZoneChange = await app.request("/v1/activity-series", {
    method: "POST",
    headers: headers(a),
    body: JSON.stringify(input),
  });
  expect(afterZoneChange.status).toBe(200);
  expect(await afterZoneChange.json()).toMatchObject({
    timeZone: "America/New_York",
    instanceCount: 3,
  });
});

test("series cursor visits every row exactly once", async () => {
  const cookie = await register();
  for (let index = 0; index < 21; index++) {
    const response = await app.request("/v1/activity-series", {
      method: "POST",
      headers: headers(cookie),
      body: JSON.stringify({
        id: crypto.randomUUID(),
        subjectId: null,
        kind: "routine",
        title: `Rutina ${index}`,
        description: null,
        priority: "low",
        estimatedMinutes: 10,
        frequency: "daily",
        startOn: "2026-09-24",
        throughOn: "2026-09-24",
      }),
    });
    expect(response.status).toBe(201);
  }
  const first = await app.request("/v1/activity-series", { headers: { cookie } });
  const firstPage = (await first.json()) as {
    items: Array<{ id: string }>;
    nextCursor: string | null;
  };
  expect(firstPage.items).toHaveLength(20);
  expect(firstPage.nextCursor).not.toBeNull();
  const second = await app.request(`/v1/activity-series?cursor=${firstPage.nextCursor}`, {
    headers: { cookie },
  });
  const secondPage = (await second.json()) as {
    items: Array<{ id: string }>;
    nextCursor: string | null;
  };
  expect(secondPage.items).toHaveLength(1);
  expect(secondPage.nextCursor).toBeNull();
  expect(new Set([...firstPage.items, ...secondPage.items].map((row) => row.id)).size).toBe(21);
  expect(
    (await app.request("/v1/activity-series?cursor=invalid", { headers: { cookie } })).status,
  ).toBe(422);
});
