import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import {
  assertApprovedLocalDatabase,
  type DatabaseTargetIdentity,
  databaseTargetIdentitySql,
} from "../src/local-database-guard";

const database = `notesia_migration_test_${crypto.randomUUID().replaceAll("-", "")}`;
const adminConfig = { host: "127.0.0.1", port: 5432, user: "postgres" } as const;
const admin = new Client({ ...adminConfig, database: "postgres" });
const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const files = readdirSync(migrationsDir)
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();
let created = false;

try {
  await admin.connect();
  const target = await admin.query<DatabaseTargetIdentity>(databaseTargetIdentitySql);
  if (!target.rows[0]) throw new Error("Migration smoke test could not identify PostgreSQL");
  assertApprovedLocalDatabase(target.rows[0], "postgres", process.env);
  const role = await admin.query("select 1 from pg_roles where rolname = 'notesia_app'");
  if (!role.rowCount) throw new Error("Local notesia_app role is required");
  await admin.query(`create database "${database}"`);
  created = true;
  const testDb = new Client({ ...adminConfig, database });
  try {
    await testDb.connect();
    await testDb.query("BEGIN");
    for (const file of files) await testDb.query(readFileSync(join(migrationsDir, file), "utf8"));
    const check = await testDb.query<{ tables: number }>(
      `select count(*)::integer as tables from information_schema.tables
       where table_schema in ('autenticacion', 'dominio')`,
    );
    if ((check.rows[0]?.tables ?? 0) < 10) throw new Error("Expected tables are missing");
    await testDb.query("COMMIT");
    console.log(`Validated ${files.length} migrations against a fresh local database`);
  } catch (error) {
    await testDb.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await testDb.end();
  }
} finally {
  if (created) await admin.query(`drop database "${database}"`);
  await admin.end();
}
