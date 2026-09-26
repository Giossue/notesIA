import { afterAll, beforeAll, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client, Pool } from "pg";
import { purgeUnverifiedAccounts } from "./unverified-accounts";

const source = process.env.DATABASE_URL;
if (!source) throw new Error("DATABASE_URL is required for unverified account tests");
const local = new URL(source);
if (
  !["127.0.0.1", "localhost", "::1"].includes(local.hostname) ||
  local.pathname !== "/notesia_dev"
)
  throw new Error("Unverified account tests require local notesia_dev credentials");

const name = `notesia_unverified_test_${crypto.randomUUID().replaceAll("-", "")}`;
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

test("purges only stale unverified student accounts", async () => {
  const insert = async (email: string, verified: boolean, age: string) =>
    (
      await seed.query<{ id: string }>(
        `INSERT INTO autenticacion.usuarios (nombre, correo, correo_verificado, creado_en)
         VALUES ('Prueba', $1, $2, now() - $3::interval) RETURNING id`,
        [email, verified, age],
      )
    ).rows[0]?.id;
  const stale = await insert("stale@example.test", false, "25 hours");
  const recent = await insert("recent@example.test", false, "2 hours");
  const verified = await insert("verified@example.test", true, "30 days");
  const staff = await insert("staff@example.test", false, "30 days");
  await seed.query(
    "INSERT INTO autenticacion.roles_usuario (usuario_id, rol) VALUES ($1, 'admin')",
    [staff],
  );

  expect(await purgeUnverifiedAccounts(runtime)).toBe(1);
  const left = await seed.query<{ id: string }>("SELECT id FROM autenticacion.usuarios");
  expect(left.rows.map((row) => row.id).sort()).toEqual([recent, verified, staff].sort());
  expect(left.rows.some((row) => row.id === stale)).toBe(false);
  expect(await purgeUnverifiedAccounts(runtime)).toBe(0);
});
