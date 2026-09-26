// Aplica las migraciones pendientes a una base remota (producción).
//
//   MIGRATION_DATABASE_URL=postgresql://admin@host:puerto/notesia_db \
//     bun packages/db/scripts/migrate-remote.ts notesia_db
//
// El nombre de la base se repite como argumento para confirmar el destino.
// La conexión necesita poder hacer SET ROLE postgres: las migraciones fijan
// privilegios por defecto "for role postgres", así que ese rol (sin login) es
// el dueño de todos los objetos, igual que en local. Sin contraseña en la URL,
// pg la toma de ~/.pgpass.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const confirmed = process.argv[2];
const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error("Define MIGRATION_DATABASE_URL");
const database = new URL(url).pathname.slice(1);
if (!confirmed || confirmed !== database)
  throw new Error(`Confirma el destino repitiendo el nombre de la base (${database})`);
if (database === "notesia_dev") throw new Error("Para la base local usa db:migrate:local");

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const files = readdirSync(migrationsDir)
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();
const client = new Client({ connectionString: url });

try {
  await client.connect();
  await client.query("BEGIN");
  await client.query("SET LOCAL ROLE postgres");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('notesia-migrations'))");
  await client.query(`CREATE TABLE IF NOT EXISTS public.migraciones (
    version text primary key,
    suma_verificacion text not null,
    aplicada_en timestamptz not null default now()
  )`);
  const existing = await client.query<{ version: string; checksum: string }>(
    "SELECT version, suma_verificacion AS checksum FROM public.migraciones",
  );
  const applied = new Map(existing.rows.map((row) => [row.version, row.checksum]));
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const recorded = applied.get(file);
    if (recorded) {
      if (recorded !== checksum) throw new Error(`Migration changed after application: ${file}`);
      continue;
    }
    await client.query(sql);
    await client.query(
      "INSERT INTO public.migraciones (version, suma_verificacion) VALUES ($1, $2)",
      [file, checksum],
    );
    console.log(`Applied ${file} on ${database}`);
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
