import { afterAll, beforeAll, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client, Pool } from "pg";
import { createAdminRepository } from "./admin-repository";

const source = process.env.DATABASE_URL;
if (!source) throw new Error("DATABASE_URL is required for admin health integration tests");
const local = new URL(source);
if (
  !["127.0.0.1", "localhost", "::1"].includes(local.hostname) ||
  local.pathname !== "/notesia_dev"
)
  throw new Error("Admin health tests require local notesia_dev credentials");

const name = `notesia_admin_health_test_${crypto.randomUUID().replaceAll("-", "")}`;
const url = new URL(local);
url.pathname = `/${name}`;
const admin = new Client({
  host: "127.0.0.1",
  port: Number(local.port || 5432),
  user: "postgres",
  database: "postgres",
});
let seed: Pool;
let runtime: Pool;
const usageIds: string[] = [];

beforeAll(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  seed = new Pool({
    host: "127.0.0.1",
    port: Number(local.port || 5432),
    user: "postgres",
    database: name,
  });
  const migrations = join(import.meta.dir, "../migrations");
  for (const file of readdirSync(migrations)
    .filter((item) => /^\d{4}_.+\.sql$/.test(item))
    .sort())
    await seed.query(readFileSync(join(migrations, file), "utf8"));
  runtime = new Pool({ connectionString: url.toString() });
});

afterAll(async () => {
  await runtime?.end();
  await seed?.end();
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
});

test("system health aggregates recent AI failures and known cost without private context", async () => {
  const rows = [
    ...["timeout", "error", "timeout", "error", "timeout"].map((status) => ({
      provider: "openai",
      status,
      cost: null,
      age: "1 minute",
    })),
    {
      provider: "openai",
      status: "reserved",
      cost: null,
      age: "1 minute",
    },
    ...["success", "success", "success", "success"].map((status) => ({
      provider: "anthropic",
      status,
      cost: "0.500000000",
      age: "2 minutes",
    })),
    ...["invalid", "invalid", "error", "error", "unknown", "invalid"].map((status) => ({
      provider: "anthropic",
      status,
      cost: null,
      age: "2 minutes",
    })),
    {
      provider: "deepseek",
      status: "success",
      cost: "0.500000000",
      age: "3 minutes",
    },
    {
      provider: "openai",
      status: "success",
      cost: "999.000000000",
      age: "20 minutes",
    },
  ];
  for (const row of rows) {
    const id = crypto.randomUUID();
    usageIds.push(id);
    await seed.query(
      `INSERT INTO dominio.uso_ia
       (id, caso, proveedor, modelo_id, version_instrucciones, estado, tokens_reservados,
        costo_usd, registrado_en)
       VALUES ($1, 'extract_activity', $2, $3, 1, $4, 100, $5, now() - $6::interval)`,
      [id, row.provider, `private-model-${row.provider}`, row.status, row.cost, row.age],
    );
  }

  const health = await createAdminRepository(runtime, "synthetic-auth-secret").systemHealth();
  expect(health.ai).toEqual({
    windowMinutes: 15,
    knownCostUsd: "2.500000000",
    uncostedRequests: 11,
    providers: [
      { provider: "anthropic", requests: 10, successes: 4, unavailable: 2, errors: 6 },
      { provider: "deepseek", requests: 1, successes: 1, unavailable: 0, errors: 0 },
      { provider: "openai", requests: 5, successes: 0, unavailable: 5, errors: 5 },
    ],
  });
  const serialized = JSON.stringify(health);
  expect(serialized).not.toContain("private-model");
  for (const id of usageIds) expect(serialized).not.toContain(id);
});
