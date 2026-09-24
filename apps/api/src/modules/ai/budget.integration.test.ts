import { afterAll, beforeAll, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type AiRouteConfig, createAiRepository } from "@notesia/db";
import { Client, Pool } from "pg";
import { reservationTokenBound } from "./gateway";

const source = process.env.DATABASE_URL;
if (!source) throw new Error("DATABASE_URL is required for AI budget integration tests");
const local = new URL(source);
if (
  !["127.0.0.1", "localhost", "::1"].includes(local.hostname) ||
  local.pathname !== "/notesia_dev"
)
  throw new Error("AI budget tests require local notesia_dev credentials");

const name = `notesia_ai_budget_test_${crypto.randomUUID().replaceAll("-", "")}`;
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
const userA = crypto.randomUUID();
const userB = crypto.randomUUID();

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
  await seed.query(
    `insert into autenticacion.usuarios (id, nombre, correo, correo_verificado)
     values ($1, 'Presupuesto A', $3, false), ($2, 'Presupuesto B', $4, false)`,
    [userA, userB, `${userA}@example.test`, `${userB}@example.test`],
  );
  runtime = new Pool({ connectionString: url.toString(), max: 20 });
});

afterAll(async () => {
  await runtime?.end();
  await seed?.end();
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
});

function route(useCase: AiRouteConfig["useCase"], dailyBudgetTokens = 100000): AiRouteConfig {
  return {
    useCase,
    provider: "openai",
    encryptedKey: Buffer.alloc(0),
    modelId: "test-model",
    timeoutMs: 1000,
    maxOutputTokens: 100,
    dailyBudgetTokens,
    inputPriceUsdPerMillion: null,
    outputPriceUsdPerMillion: null,
  };
}

test("AI reservation accounts for UTF-8 input and serialized prompt", () => {
  const instruction = "Explica el riesgo";
  const schema = { type: "object", properties: { text: { type: "string" } } };
  const payload = { text: "á😀".repeat(100) };
  const request = JSON.stringify({ instruction, jsonSchema: schema, payload });
  expect(reservationTokenBound(instruction, schema, payload, 200)).toBeGreaterThan(
    Buffer.byteLength(request, "utf8") + 200,
  );
});

test("concurrent cases share one per-user rate limit and each case respects its budget", async () => {
  const repository = createAiRepository(runtime);
  const results = await Promise.all(
    Array.from({ length: 11 }, (_, index) =>
      repository.reserve(userA, route(index % 2 ? "extract_activity" : "propose_subtasks"), 1, 100),
    ),
  );
  expect(results.filter((result) => result.kind === "reserved")).toHaveLength(10);
  expect(results.filter((result) => result.kind === "rate_limited")).toHaveLength(1);
  const stored = await seed.query<{ count: number }>(
    "select count(*)::integer as count from dominio.uso_ia where usuario_id = $1",
    [userA],
  );
  expect(stored.rows[0]?.count).toBe(10);

  const limited = route("explain_risk", 200);
  expect((await repository.reserve(userB, limited, 2, 100)).kind).toBe("reserved");
  expect((await repository.reserve(userB, limited, 2, 100)).kind).toBe("reserved");
  expect((await repository.reserve(userB, limited, 2, 100)).kind).toBe("budget_exhausted");
});
