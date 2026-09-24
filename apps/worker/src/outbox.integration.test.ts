import { afterAll, expect, test } from "bun:test";
import { createOutboxRepository } from "@notesia/db";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for outbox integration tests");
const target = new URL(databaseUrl);
if (
  !["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
  target.pathname !== "/notesia_dev"
)
  throw new Error("Outbox integration tests only run against local notesia_dev");

const pool = new Pool({ connectionString: databaseUrl, max: 3 });
const userId = crypto.randomUUID();
const planId = crypto.randomUUID();

afterAll(async () => {
  await pool.query("DELETE FROM autenticacion.usuarios WHERE id = $1", [userId]);
  await pool.end();
});

test("an opt-out committed while the outbox delivers prevents a plan notice", async () => {
  await pool.query(
    `INSERT INTO autenticacion.usuarios (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Prueba outbox', $2, false)`,
    [userId, `outbox-${userId}@example.test`],
  );
  const revision = await pool.query<{ value: string }>(
    `SELECT revision::text AS value FROM dominio.revisiones_planificacion WHERE usuario_id = $1`,
    [userId],
  );
  await pool.query(
    `INSERT INTO dominio.planes
       (id, usuario_id, estado, version_algoritmo, revision_origen,
        fecha_desde, fecha_hasta, sesion_minima, sesion_maxima, maximo_diario)
     VALUES ($1,$2,'active','deterministic-v2',$3,'2026-10-05','2026-10-06',25,90,240)`,
    [planId, userId, revision.rows[0]?.value],
  );
  await pool.query(
    `INSERT INTO dominio.bandeja_salida (usuario_id, tipo_evento, plan_id)
     VALUES ($1,'plan.applied',$2)`,
    [userId, planId],
  );

  let intercepted = false;
  const interleavedPool = {
    connect: async () => {
      const worker = await pool.connect();
      return {
        query: async (statement: string, values?: unknown[]) => {
          if (!statement.includes("insert into dominio.notificaciones"))
            return worker.query(statement, values);
          intercepted = true;
          const preferenceWriter = await pool.connect();
          let committed = false;
          try {
            await preferenceWriter.query("BEGIN");
            await preferenceWriter.query(
              `UPDATE dominio.preferencias_usuario
               SET notificaciones_habilitadas = false WHERE usuario_id = $1`,
              [userId],
            );
            const insertion = worker.query(statement, values);
            await Promise.race([
              insertion.then(
                () => undefined,
                () => undefined,
              ),
              new Promise<void>((resolve) => setTimeout(resolve, 250)),
            ]);
            await preferenceWriter.query("COMMIT");
            committed = true;
            return insertion;
          } finally {
            if (!committed) await preferenceWriter.query("ROLLBACK").catch(() => {});
            preferenceWriter.release();
          }
        },
        release: () => worker.release(),
      };
    },
  } as unknown as Pool;
  expect(await createOutboxRepository(interleavedPool).processOne()).toEqual({
    kind: "delivered",
  });
  expect(intercepted).toBe(true);
  const notices = await pool.query<{ total: number }>(
    `SELECT count(*)::integer AS total FROM dominio.notificaciones
     WHERE usuario_id = $1 AND tipo = 'plan_applied'`,
    [userId],
  );
  expect(notices.rows[0]?.total).toBe(0);
  const preference = await pool.query<{ enabled: boolean }>(
    `SELECT notificaciones_habilitadas AS enabled
     FROM dominio.preferencias_usuario WHERE usuario_id = $1`,
    [userId],
  );
  expect(preference.rows[0]?.enabled).toBe(false);
});
