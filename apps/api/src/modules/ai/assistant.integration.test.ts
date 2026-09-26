import { afterAll, beforeAll, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createAiContextRepository, createAiRepository } from "@notesia/db";
import { Client, Pool } from "pg";
import { runAssistantTurn } from "./assistant";
import { createAiGateway } from "./gateway";
import { createAiKeyCipher } from "./key-cipher";

const source = process.env.DATABASE_URL;
if (!source) throw new Error("DATABASE_URL is required for assistant tests");
const local = new URL(source);
if (
  !["127.0.0.1", "localhost", "::1"].includes(local.hostname) ||
  local.pathname !== "/notesia_dev"
)
  throw new Error("Assistant tests require local notesia_dev credentials");

const name = `notesia_assistant_test_${crypto.randomUUID().replaceAll("-", "")}`;
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
const strangerId = crypto.randomUUID();
const withoutConsentId = crypto.randomUUID();
const ownActivity = crypto.randomUUID();
const strangerActivity = crypto.randomUUID();
const cipher = createAiKeyCipher(crypto.getRandomValues(Buffer.alloc(32)).toString("base64"));
// Viernes 2 de octubre de 2026, 10:00 en Guayaquil.
const now = new Date("2026-10-02T15:00:00Z");

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
  for (const id of [userId, strangerId, withoutConsentId])
    await seed.query(
      `INSERT INTO autenticacion.usuarios (id, nombre, correo, correo_verificado)
       VALUES ($1, 'Asistente', $2, true)`,
      [id, `${id}@example.test`],
    );
  await seed.query(
    "UPDATE dominio.perfiles_usuario SET zona_horaria = 'America/Guayaquil' WHERE usuario_id = $1",
    [userId],
  );
  const documentId = crypto.randomUUID();
  await seed.query(
    `INSERT INTO dominio.documentos_privacidad (id, tipo, idioma, version, contenido, publicado_en)
     VALUES ($1, 'ai', 'es', 1, 'Documento sintético de prueba', now())`,
    [documentId],
  );
  for (const id of [userId, strangerId])
    await seed.query(
      `INSERT INTO dominio.consentimientos (id, usuario_id, documento_id, decision)
       VALUES ($1, $2, $3, 'accepted')`,
      [crypto.randomUUID(), id, documentId],
    );
  await seed.query(
    `INSERT INTO dominio.actividades (id, usuario_id, tipo, titulo, fecha_limite)
     VALUES ($1, $2, 'academic_task', 'Deber de Cálculo', '2026-10-05T04:59:00Z'),
            ($3, $4, 'academic_task', 'Cálculo ajeno', '2026-10-05T04:59:00Z')`,
    [ownActivity, userId, strangerActivity, strangerId],
  );
  const providerId = crypto.randomUUID();
  await seed.query(
    `INSERT INTO dominio.proveedores_ia (id, proveedor, clave_cifrada, habilitado)
     VALUES ($1, 'openai', $2, true)`,
    [providerId, cipher.encrypt("openai", "test-key")],
  );
  await seed.query(
    `INSERT INTO dominio.rutas_ia
     (caso, proveedor_id, modelo_id, tiempo_limite_ms, maximo_salida_tokens,
      presupuesto_diario_tokens, habilitado, precio_entrada_usd_millon, precio_salida_usd_millon)
     VALUES ('assistant_chat', $1, 'test-model', 3000, 1024, 10000000, true, 1, 2)`,
    [providerId],
  );
  runtime = new Pool({ connectionString: url.toString() });
});

afterAll(async () => {
  await runtime?.end();
  await seed?.end();
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
});

const flat = (overrides: Record<string, unknown>) => ({
  type: "create_activity",
  activityId: null,
  eventId: null,
  title: null,
  description: null,
  kind: null,
  priority: null,
  startAfterAt: null,
  deadlineAt: null,
  estimatedMinutes: null,
  startsAt: null,
  endsAt: null,
  progressPercent: null,
  transition: null,
  subtasks: null,
  ...overrides,
});

/** Proveedor falso: devuelve en orden las respuestas dadas y guarda lo que recibió. */
function fakeProvider(outputs: unknown[]) {
  const inputs: unknown[] = [];
  const fetcher = async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { input: string };
    inputs.push(JSON.parse(body.input));
    return Response.json({
      status: "completed",
      output: [
        { content: [{ type: "output_text", text: JSON.stringify(outputs[inputs.length - 1]) }] },
      ],
      usage: { input_tokens: 20, output_tokens: 10 },
    });
  };
  return { fetcher, inputs };
}

test("the assistant looks up the student's data and only proposes changes", async () => {
  const provider = fakeProvider([
    {
      reply: "Déjame revisar tus actividades.",
      actions: [],
      queries: [{ type: "activities", text: "cálculo", from: null, to: null, includeDone: false }],
    },
    {
      reply: "Te propongo marcar tu deber de Cálculo como completado y crear el examen.",
      actions: [
        flat({ type: "transition_activity", activityId: ownActivity, transition: "complete" }),
        // Un id que el servidor no le mostró: se descarta.
        flat({ type: "delete_activity", activityId: strangerActivity }),
        flat({
          type: "create_activity",
          title: "Examen de Física",
          kind: "exam",
          priority: "high",
          deadlineAt: "2026-10-09T10:00:00-05:00",
        }),
        // Fecha fuera de la ventana razonable: se descarta.
        flat({ type: "create_activity", title: "Viejo", deadlineAt: "2020-01-01T00:00:00Z" }),
      ],
      queries: [],
    },
  ]);
  const dependencies = {
    gateway: createAiGateway(createAiRepository(runtime), cipher, provider.fetcher),
    context: createAiContextRepository(runtime),
  };
  const result = await runAssistantTurn(
    dependencies,
    userId,
    { message: "Ya terminé el deber de cálculo y el viernes tengo examen de física", history: [] },
    now,
  );
  expect(result).toEqual({
    kind: "reply",
    source: "ai",
    requiresConfirmation: true,
    promptVersion: 1,
    reply: "Te propongo marcar tu deber de Cálculo como completado y crear el examen.",
    actions: [
      {
        type: "transition_activity",
        activityId: ownActivity,
        title: "Deber de Cálculo",
        transition: "complete",
      },
      {
        type: "create_activity",
        activity: {
          kind: "exam",
          title: "Examen de Física",
          description: null,
          priority: "high",
          startAfterAt: null,
          deadlineAt: "2026-10-09T15:00:00.000Z",
          estimatedMinutes: null,
        },
      },
    ],
  });
  // Hora local y zona del estudiante; solo sus datos en la consulta.
  const [first, second] = provider.inputs as Array<{
    now: string;
    results: { activities: Array<{ id: string; deadlineAt: string }> } | null;
  }>;
  expect(first?.now).toBe("2026-10-02T10:00:00-05:00 (viernes)");
  expect(first?.results).toBeNull();
  expect(second?.results?.activities.map((row) => row.id)).toEqual([ownActivity]);
  expect(second?.results?.activities[0]?.deadlineAt).toBe("2026-10-04T23:59:00-05:00");
  // Nada se aplicó y cada llamada quedó registrada.
  const status = await seed.query("SELECT estado FROM dominio.actividades WHERE id = $1", [
    ownActivity,
  ]);
  expect(status.rows[0]?.estado).toBe("backlog");
  const usage = await seed.query(
    "SELECT count(*)::int AS total FROM dominio.uso_ia WHERE caso = 'assistant_chat' AND estado = 'success'",
  );
  expect(usage.rows[0]?.total).toBe(2);
});

test("the assistant requires the AI consent and falls back to manual on bad output", async () => {
  const provider = fakeProvider([{ reply: "", actions: "no", queries: [] }]);
  const dependencies = {
    gateway: createAiGateway(createAiRepository(runtime), cipher, provider.fetcher),
    context: createAiContextRepository(runtime),
  };
  expect(
    await runAssistantTurn(dependencies, withoutConsentId, { message: "Hola", history: [] }, now),
  ).toEqual({ kind: "consent_required" });
  expect(provider.inputs).toHaveLength(0);
  expect(
    await runAssistantTurn(dependencies, userId, { message: "Hola", history: [] }, now),
  ).toEqual({ kind: "manual", reason: "invalid_output" });
});
