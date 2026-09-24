import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import {
  assertApprovedLocalDatabase,
  type DatabaseTargetIdentity,
  databaseTargetIdentitySql,
} from "../src/local-database-guard";

const database = process.argv[2];
const baseline = process.argv.includes("--baseline-existing");
if (database !== "notesia_dev") {
  throw new Error("La única base local es notesia_dev");
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const files = readdirSync(migrationsDir)
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();
const client = new Client({ host: "127.0.0.1", port: 5432, user: "postgres", database });

try {
  await client.connect();
  const target = await client.query<DatabaseTargetIdentity>(databaseTargetIdentitySql);
  if (!target.rows[0]) throw new Error("Migration target could not be identified");
  assertApprovedLocalDatabase(target.rows[0], database, process.env);

  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('notesia-local-migrations'))");
  // Tabla de control renombrada al español; conserva el historial ya registrado.
  await client.query(`DO $$ BEGIN
    IF to_regclass('public.notesia_migrations') IS NOT NULL THEN
      ALTER TABLE public.notesia_migrations RENAME TO migraciones;
      ALTER TABLE public.migraciones RENAME COLUMN checksum TO suma_verificacion;
      ALTER TABLE public.migraciones RENAME COLUMN applied_at TO aplicada_en;
    END IF;
  END $$`);
  await client.query(`CREATE TABLE IF NOT EXISTS public.migraciones (
    version text primary key,
    suma_verificacion text not null,
    aplicada_en timestamptz not null default now()
  )`);
  const existing = await client.query<{ version: string; checksum: string }>(
    "SELECT version, suma_verificacion AS checksum FROM public.migraciones",
  );
  const applied = new Map(existing.rows.map((row) => [row.version, row.checksum]));
  if (baseline && applied.size > 0)
    throw new Error("Baseline only works before any migration is recorded");

  if (baseline) {
    const objects = await client.query<{
      auth_user: string | null;
      secure_store: string | null;
      profiles: string | null;
      trigger: number;
    }>(
      `SELECT to_regclass('auth.user')::text AS auth_user,
        to_regclass('auth.secure_store')::text AS secure_store,
        to_regclass('domain.user_profiles')::text AS profiles,
        (SELECT count(*)::integer FROM pg_trigger WHERE tgname = 'auth_user_profile_created') AS trigger`,
    );
    const row = objects.rows[0];
    if (!row?.auth_user || !row.secure_store || !row.profiles || row.trigger !== 1) {
      throw new Error("Existing schema does not match the two local baseline migrations");
    }
  }

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const recorded = applied.get(file);
    if (recorded) {
      if (recorded !== checksum) throw new Error(`Migration changed after application: ${file}`);
      continue;
    }
    if (!baseline) await client.query(sql);
    await client.query(
      "INSERT INTO public.migraciones (version, suma_verificacion) VALUES ($1, $2)",
      [file, checksum],
    );
    console.log(`${baseline ? "Recorded" : "Applied"} ${file} on ${database}`);
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
