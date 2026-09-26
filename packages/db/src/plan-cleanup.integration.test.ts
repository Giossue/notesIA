import { afterAll, expect, test } from "bun:test";
import { Pool } from "pg";
import { purgeOldPlans } from "./plan-cleanup";

const source = process.env.DATABASE_URL;
if (!source) throw new Error("DATABASE_URL is required for plan cleanup tests");
const target = new URL(source);
if (
  !["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
  target.pathname !== "/notesia_dev"
)
  throw new Error("Plan cleanup tests only run against local notesia_dev");

const pool = new Pool({ connectionString: source, max: 2 });
const userId = crypto.randomUUID();

afterAll(async () => {
  await pool.query("DELETE FROM autenticacion.usuarios WHERE id = $1", [userId]);
  await pool.end();
});

test("old replaced or abandoned plans are purged; recent ones stay", async () => {
  await pool.query(
    `INSERT INTO autenticacion.usuarios (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Prueba limpieza', $2, true)`,
    [userId, `plans-${userId}@example.test`],
  );
  const plan = async (status: string, daysAgo: number) => {
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO dominio.planes (id, usuario_id, estado, version_algoritmo, revision_origen,
         fecha_desde, fecha_hasta, sesion_minima, sesion_maxima, maximo_diario, creado_en)
       VALUES ($1,$2,$3,'test',0,'2026-01-01','2026-01-08',30,90,180,
         now() - make_interval(days => $4))`,
      [id, userId, status, daysAgo],
    );
    return id;
  };
  const old = await plan("superseded", 40);
  const recent = await plan("superseded", 3);
  // Sin planes activos: la reevaluación de riesgo del worker los tomaría en otras pruebas.
  const oldDraft = await plan("draft", 40);
  const recentRejected = await plan("rejected", 3);
  await purgeOldPlans(pool);
  const left = await pool.query<{ id: string }>(
    "SELECT id FROM dominio.planes WHERE usuario_id = $1",
    [userId],
  );
  const ids = left.rows.map((row) => row.id);
  expect(ids).not.toContain(old);
  expect(ids).not.toContain(oldDraft);
  expect(ids).toEqual(expect.arrayContaining([recent, recentRejected]));
});
