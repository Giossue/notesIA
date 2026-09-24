import { afterAll, beforeAll, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertApprovedLocalDatabase,
  createAiRepository,
  createPrivacyRepository,
  type DatabaseTargetIdentity,
  databaseTargetIdentitySql,
} from "@notesia/db";
import { Client, Pool } from "pg";

const source = process.env.DATABASE_URL;
if (!source) throw new Error("DATABASE_URL is required for consent ordering tests");
const local = new URL(source);
if (
  !["127.0.0.1", "localhost", "::1"].includes(local.hostname) ||
  local.pathname !== "/notesia_dev"
)
  throw new Error("Consent ordering tests require local notesia_dev credentials");

const testName = `notesia_consent_test_${crypto.randomUUID().replaceAll("-", "")}`;
const testUrl = new URL(local);
testUrl.pathname = `/${testName}`;
const admin = new Client({
  host: "127.0.0.1",
  port: Number(local.port || 5432),
  user: "postgres",
  database: "postgres",
});
const migrationsDir = join(import.meta.dir, "../../../../../packages/db/migrations");
let seed: Pool | undefined;
let runtime: Pool | undefined;
let created = false;

beforeAll(async () => {
  await admin.connect();
  const target = await admin.query<DatabaseTargetIdentity>(databaseTargetIdentitySql);
  if (!target.rows[0]) throw new Error("Consent ordering database could not be identified");
  assertApprovedLocalDatabase(target.rows[0], "postgres", process.env);
  await admin.query(`CREATE DATABASE "${testName}"`);
  created = true;
  seed = new Pool({
    host: "127.0.0.1",
    port: 5432,
    user: "postgres",
    database: testName,
  });
  const files = readdirSync(migrationsDir)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name) && name < "0039_")
    .sort();
  for (const file of files) await seed.query(readFileSync(join(migrationsDir, file), "utf8"));
  runtime = new Pool({ connectionString: testUrl.toString() });
});

afterAll(async () => {
  await runtime?.end();
  await seed?.end();
  if (created) await admin.query(`DROP DATABASE "${testName}" WITH (FORCE)`);
  await admin.end();
});

test("revocation wins a timestamp tie during migration and later acceptance remains possible", async () => {
  if (!seed || !runtime) throw new Error("Test database unavailable");
  const userId = crypto.randomUUID();
  const documentId = crypto.randomUUID();
  await seed.query(
    `INSERT INTO autenticacion.usuarios (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Prueba', $2, true)`,
    [userId, `${userId}@example.test`],
  );
  await seed.query(
    `INSERT INTO dominio.documentos_privacidad
       (id, tipo, version, idioma, contenido, publicado_en)
     VALUES ($1, 'ai', 1, 'es', 'Texto sintético de prueba', now())`,
    [documentId],
  );
  await seed.query(
    `INSERT INTO dominio.consentimientos
       (id, usuario_id, documento_id, decision, registrado_en)
     VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff', $1, $2, 'accepted', $3),
            ('00000000-0000-4000-8000-000000000000', $1, $2, 'revoked', $3)`,
    [userId, documentId, "2026-10-05T12:00:00Z"],
  );
  const oldOrder = await seed.query<{ decision: string }>(
    `SELECT decision FROM dominio.consentimientos
     WHERE usuario_id = $1 ORDER BY registrado_en DESC, id DESC LIMIT 1`,
    [userId],
  );
  expect(oldOrder.rows[0]?.decision).toBe("accepted");

  await seed.query(readFileSync(join(migrationsDir, "0039_orden_consentimientos.sql"), "utf8"));
  const privacy = createPrivacyRepository(runtime);
  const ai = createAiRepository(runtime);
  expect((await privacy.currentConsents(userId))[0]?.decision).toBe("revoked");
  expect(await ai.hasCurrentConsent(userId)).toBe(false);

  expect((await privacy.accept(userId, documentId))?.decision).toBe("accepted");
  expect((await privacy.currentConsents(userId))[0]?.decision).toBe("accepted");
  expect(await ai.hasCurrentConsent(userId)).toBe(true);
  expect((await privacy.revokeAi(userId))?.decision).toBe("revoked");
  expect(await ai.hasCurrentConsent(userId)).toBe(false);
});
