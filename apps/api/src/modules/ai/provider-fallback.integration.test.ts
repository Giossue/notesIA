import { afterAll, beforeAll, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createAiRepository } from "@notesia/db";
import { Client, Pool } from "pg";
import { createAiGateway } from "./gateway";
import { createAiKeyCipher } from "./key-cipher";

const source = process.env.DATABASE_URL;
if (!source) throw new Error("DATABASE_URL is required for AI fallback tests");
const local = new URL(source);
if (
  !["127.0.0.1", "localhost", "::1"].includes(local.hostname) ||
  local.pathname !== "/notesia_dev"
)
  throw new Error("AI fallback tests require local notesia_dev credentials");

const name = `notesia_ai_fallback_test_${crypto.randomUUID().replaceAll("-", "")}`;
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
const userId = crypto.randomUUID();
const documentId = crypto.randomUUID();
const cipher = createAiKeyCipher(crypto.getRandomValues(Buffer.alloc(32)).toString("base64"));

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
    `INSERT INTO autenticacion.usuarios (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Fallback Test', $2, false)`,
    [userId, `${userId}@example.test`],
  );
  await seed.query(
    `INSERT INTO dominio.documentos_privacidad
     (id, tipo, idioma, version, contenido, publicado_en)
     VALUES ($1, 'ai', 'es', 1, 'Documento sintético de prueba', now())`,
    [documentId],
  );
  await seed.query(
    `INSERT INTO dominio.consentimientos (id, usuario_id, documento_id, decision)
     VALUES ($1,$2,$3,'accepted')`,
    [crypto.randomUUID(), userId, documentId],
  );
  const primaryId = crypto.randomUUID();
  const alternateId = crypto.randomUUID();
  await seed.query(
    `INSERT INTO dominio.proveedores_ia (id, proveedor, clave_cifrada, habilitado)
     VALUES ($1,'openai',$2,true), ($3,'anthropic',$4,true)`,
    [
      primaryId,
      cipher.encrypt("openai", "primary-test-key"),
      alternateId,
      cipher.encrypt("anthropic", "alternate-test-key"),
    ],
  );
  await seed.query(
    `INSERT INTO dominio.rutas_ia
     (caso, proveedor_id, modelo_id, tiempo_limite_ms, maximo_salida_tokens,
      presupuesto_diario_tokens, habilitado, precio_entrada_usd_millon,
      precio_salida_usd_millon, proveedor_alterno_id, modelo_alterno_id,
      tiempo_limite_alterno_ms, maximo_salida_alterno_tokens,
      precio_entrada_alterno_usd_millon, precio_salida_alterno_usd_millon)
     VALUES ('extract_activity',$1,'test-primary',3000,256,10000000,true,1,2,
       $2,'test-alternate',3000,256,3,4)`,
    [primaryId, alternateId],
  );
  runtime = new Pool({ connectionString: url.toString() });
});

afterAll(async () => {
  await runtime?.end();
  await seed?.end();
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
});

test("provider failover persists both reservations and an audited transition", async () => {
  const repository = createAiRepository(runtime);
  const called: string[] = [];
  const gateway = createAiGateway(repository, cipher, async (endpoint) => {
    called.push(endpoint);
    if (endpoint.includes("openai.com")) return new Response("unavailable", { status: 503 });
    return Response.json({
      stop_reason: "end_turn",
      content: [
        {
          type: "text",
          text: JSON.stringify({
            title: "Resumen de biología",
            description: "Preparar un resumen",
          }),
        },
      ],
      usage: { input_tokens: 11, output_tokens: 5 },
    });
  });
  const result = await gateway.suggest(userId, "extract_activity", { text: "Resumir biología" });
  expect(result).toMatchObject({
    kind: "suggestion",
    value: { title: "Resumen de biología" },
  });
  expect(called).toHaveLength(2);
  const usages = await seed.query<{ provider: string; status: string; cost: string | null }>(
    `SELECT proveedor AS provider, estado AS status, costo_usd::text AS cost
     FROM dominio.uso_ia ORDER BY CASE WHEN proveedor = 'openai' THEN 0 ELSE 1 END`,
  );
  expect(usages.rows).toEqual([
    { provider: "openai", status: "error", cost: null },
    { provider: "anthropic", status: "success", cost: "0.000053000" },
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  expect(await repository.transitionSummary(today, tomorrow)).toEqual([
    {
      useCase: "extract_activity",
      fromProvider: "openai",
      toProvider: "anthropic",
      reason: "provider_unavailable",
      requests: 1,
    },
  ]);
  const config = await repository.listRoutes();
  expect(config[0]?.alternate).toMatchObject({ provider: "anthropic", modelId: "test-alternate" });
  expect(JSON.stringify(config)).not.toContain("alternate-test-key");
});

test("invalid primary output uses the alternate and records the cause", async () => {
  const repository = createAiRepository(runtime);
  const called: string[] = [];
  const gateway = createAiGateway(repository, cipher, async (endpoint) => {
    called.push(endpoint);
    if (endpoint.includes("openai.com"))
      return Response.json({
        status: "completed",
        output: [{ content: [{ type: "output_text", text: "not-json" }] }],
      });
    return Response.json({
      stop_reason: "end_turn",
      content: [
        {
          type: "text",
          text: JSON.stringify({
            title: "Resumen de biología",
            description: "Preparar un resumen",
          }),
        },
      ],
      usage: { input_tokens: 11, output_tokens: 5 },
    });
  });
  expect(
    await gateway.suggest(userId, "extract_activity", { text: "Resumir biología" }),
  ).toMatchObject({
    kind: "suggestion",
  });
  expect(called).toHaveLength(2);
  const transitions = await seed.query<{ reason: string }>(
    "SELECT motivo AS reason FROM dominio.transiciones_ia ORDER BY registrado_en",
  );
  expect(transitions.rows.map((row) => row.reason).sort()).toEqual([
    "invalid_output",
    "provider_unavailable",
  ]);
});

test("secondary request is withheld when the shared daily budget is exhausted", async () => {
  const current = await seed.query<{ used: string; perAttempt: number }>(
    `SELECT sum(tokens_reservados)::text AS used,
       max(tokens_reservados)::integer AS "perAttempt" FROM dominio.uso_ia`,
  );
  const limit = Number(current.rows[0]?.used) + Number(current.rows[0]?.perAttempt) + 1;
  await seed.query(
    "UPDATE dominio.rutas_ia SET presupuesto_diario_tokens = $1 WHERE caso = 'extract_activity'",
    [limit],
  );
  const called: string[] = [];
  const gateway = createAiGateway(createAiRepository(runtime), cipher, async (endpoint) => {
    called.push(endpoint);
    return new Response("unavailable", { status: 503 });
  });
  expect(await gateway.suggest(userId, "extract_activity", { text: "Resumir biología" })).toEqual({
    kind: "manual",
    reason: "budget_exhausted",
  });
  expect(called).toHaveLength(1);
  const transitions = await seed.query<{ count: number }>(
    "SELECT count(*)::integer AS count FROM dominio.transiciones_ia",
  );
  expect(transitions.rows[0]?.count).toBe(2);
});

test("revoked consent prevents the alternate provider request", async () => {
  await seed.query(
    "UPDATE dominio.rutas_ia SET presupuesto_diario_tokens = 10000000 WHERE caso = 'extract_activity'",
  );
  const called: string[] = [];
  const gateway = createAiGateway(createAiRepository(runtime), cipher, async (endpoint) => {
    called.push(endpoint);
    await seed.query(
      `INSERT INTO dominio.consentimientos (id, usuario_id, documento_id, decision)
       VALUES ($1,$2,$3,'revoked')`,
      [crypto.randomUUID(), userId, documentId],
    );
    return new Response("unavailable", { status: 503 });
  });
  expect(await gateway.suggest(userId, "extract_activity", { text: "Resumir biología" })).toEqual({
    kind: "consent_required",
  });
  expect(called).toHaveLength(1);
  const transitions = await seed.query<{ count: number }>(
    "SELECT count(*)::integer AS count FROM dominio.transiciones_ia",
  );
  expect(transitions.rows[0]?.count).toBe(2);
});

test("route updates can remove the alternate and retain an admin audit event", async () => {
  const repository = createAiRepository(runtime);
  expect(
    await repository.upsertRoute(userId, {
      useCase: "extract_activity",
      provider: "openai",
      modelId: "test-primary",
      timeoutMs: 3000,
      maxOutputTokens: 256,
      dailyBudgetTokens: 10000000,
      inputPriceUsdPerMillion: "1",
      outputPriceUsdPerMillion: "2",
      enabled: true,
      alternate: null,
    }),
  ).toBe(true);
  expect((await repository.route("extract_activity"))?.alternate).toBeNull();
  const audit = await seed.query<{ count: number }>(
    `SELECT count(*)::integer AS count FROM dominio.auditoria_admin
     WHERE actor_id = $1 AND accion = 'ai_route.updated'`,
    [userId],
  );
  expect(audit.rows[0]?.count).toBe(1);
});
