import { afterAll, beforeAll, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createAiRepository,
  createIdempotencyRepository,
  purgeExpiredSecureStorage,
} from "@notesia/db";
import { Client, Pool } from "pg";

const source = process.env.DATABASE_URL;
if (!source) throw new Error("DATABASE_URL is required for maintenance integration tests");
const local = new URL(source);
if (
  !["127.0.0.1", "localhost", "::1"].includes(local.hostname) ||
  local.pathname !== "/notesia_dev"
)
  throw new Error("Maintenance tests require local notesia_dev credentials");

const name = `notesia_maintenance_test_${crypto.randomUUID().replaceAll("-", "")}`;
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

beforeAll(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  seed = new Pool({
    host: "127.0.0.1",
    port: Number(local.port || 5432),
    user: "postgres",
    database: name,
  });
  const migrations = join(import.meta.dir, "../../../packages/db/migrations");
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

test("worker purges expired session and idempotency rows in bounded batches", async () => {
  const userId = crypto.randomUUID();
  await seed.query(
    `INSERT INTO autenticacion.usuarios (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Mantenimiento', $2, false)`,
    [userId, `maintenance-${userId}@example.test`],
  );
  const hashes = [randomBytes(32), randomBytes(32), randomBytes(32)];
  await seed.query(
    `INSERT INTO autenticacion.almacen_seguro (clave_hash, expira_en)
     VALUES ($1, now() - interval '2 minutes'),
            ($2, now() - interval '1 minute'),
            ($3, now() + interval '1 hour')`,
    hashes,
  );
  const keys = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  await seed.query(
    `INSERT INTO dominio.claves_idempotencia
      (usuario_id, clave, metodo, ruta, hash_peticion, estado_respuesta,
       cuerpo_respuesta, expira_en)
     VALUES ($1,$2,'POST','/v1/test',$5,200,'{}',now() - interval '2 minutes'),
            ($1,$3,'POST','/v1/test',$5,200,'{}',now() - interval '1 minute'),
            ($1,$4,'POST','/v1/test',$5,200,'{}',now() + interval '1 hour')`,
    [userId, ...keys, "0".repeat(64)],
  );

  const idempotency = createIdempotencyRepository(runtime);
  expect(await purgeExpiredSecureStorage(runtime, 1)).toBe(1);
  expect(await idempotency.purgeExpired(1)).toBe(1);
  expect(await purgeExpiredSecureStorage(runtime, 1)).toBe(1);
  expect(await idempotency.purgeExpired(1)).toBe(1);
  expect(await purgeExpiredSecureStorage(runtime, 1)).toBe(0);
  expect(await idempotency.purgeExpired(1)).toBe(0);
  expect((await seed.query(`SELECT clave_hash FROM autenticacion.almacen_seguro`)).rows).toEqual([
    { clave_hash: hashes[2] },
  ]);
  expect(
    (
      await seed.query(`SELECT clave FROM dominio.claves_idempotencia WHERE usuario_id = $1`, [
        userId,
      ])
    ).rows,
  ).toEqual([{ clave: keys[2] }]);
  await expect(purgeExpiredSecureStorage(runtime, 0)).rejects.toThrow();
  await expect(idempotency.purgeExpired(1001)).rejects.toThrow();
});

test("worker marks abandoned AI reservations uncertain without releasing budget", async () => {
  const ids = Array.from({ length: 4 }, () => crypto.randomUUID());
  await seed.query(
    `INSERT INTO dominio.uso_ia
      (id, caso, proveedor, modelo_id, version_instrucciones, estado, tokens_reservados, registrado_en)
     VALUES ($1, 'extract_activity', 'openai', 'test-model', 1, 'reserved', 100,
               now() - interval '10 minutes'),
            ($2, 'extract_activity', 'openai', 'test-model', 1, 'reserved', 100,
               now() - interval '9 minutes'),
            ($3, 'extract_activity', 'openai', 'test-model', 1, 'reserved', 100, now()),
            ($4, 'extract_activity', 'openai', 'test-model', 1, 'success', 100,
               now() - interval '10 minutes')`,
    ids,
  );
  const ai = createAiRepository(runtime);
  expect(await ai.reconcileAbandoned(1)).toBe(1);
  expect(await ai.reconcileAbandoned(1)).toBe(1);
  expect(await ai.reconcileAbandoned(1)).toBe(0);
  const beforeFinish = await seed.query<{ status: string; tokens: number }>(
    `SELECT estado AS status, tokens_reservados AS tokens
     FROM dominio.uso_ia WHERE id = ANY($1::uuid[]) ORDER BY id`,
    [ids],
  );
  expect(beforeFinish.rows.filter((row) => row.status === "unknown")).toHaveLength(2);
  expect(beforeFinish.rows.every((row) => row.tokens === 100)).toBe(true);
  await ai.finish(ids[0] ?? "", "success", 10, 5, false, 200);
  const final = await seed.query<{ status: string; tokens: number; durationMs: number }>(
    `SELECT estado AS status, tokens_reservados AS tokens,
       duracion_ms AS "durationMs" FROM dominio.uso_ia WHERE id = $1`,
    [ids[0]],
  );
  expect(final.rows[0]).toMatchObject({ status: "success", tokens: 100, durationMs: 200 });
  expect(
    (await seed.query("SELECT estado FROM dominio.uso_ia WHERE id = $1", [ids[2]])).rows[0]?.estado,
  ).toBe("reserved");
  await expect(ai.reconcileAbandoned(0)).rejects.toThrow();
});
