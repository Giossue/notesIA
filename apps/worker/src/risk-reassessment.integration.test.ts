import { afterAll, expect, test } from "bun:test";
import { createNotificationSchedulerRepository } from "@notesia/db";
import { Pool } from "pg";
import { createRiskReassessment } from "./risk-reassessment";

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("DATABASE_URL is required for risk integration tests");
const target = new URL(sourceUrl);
if (
  !["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
  target.pathname !== "/notesia_dev"
)
  throw new Error("Risk integration tests only run against local notesia_dev");

const pool = new Pool({ connectionString: sourceUrl });
const assessor = createRiskReassessment(pool);
const scheduler = createNotificationSchedulerRepository(pool);
const userId = crypto.randomUUID();
const activityId = crypto.randomUUID();
const planId = crypto.randomUUID();

afterAll(async () => {
  await pool.query("DELETE FROM autenticacion.usuarios WHERE id = $1", [userId]);
  await pool.end();
});

test("worker recalculates risk after source changes without rewriting plan history", async () => {
  await pool.query(
    `INSERT INTO autenticacion.usuarios (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Prueba de riesgo', $2, false)`,
    [userId, `risk-worker-${userId}@example.test`],
  );
  await pool.query(
    "UPDATE dominio.perfiles_usuario SET zona_horaria = 'Etc/UTC' WHERE usuario_id = $1",
    [userId],
  );
  await pool.query(
    `INSERT INTO dominio.reglas_disponibilidad
     (id, usuario_id, dia_semana, minuto_inicio, minuto_fin)
     VALUES ($1,$2,1,540,600)`,
    [crypto.randomUUID(), userId],
  );
  await pool.query(
    `INSERT INTO dominio.actividades
     (id, usuario_id, tipo, titulo, prioridad, fecha_limite, minutos_estimados)
     VALUES ($1,$2,'academic_task','Informe','high','2026-10-05T12:00:00.000Z',120)`,
    [activityId, userId],
  );
  const revision = await pool.query<{ revision: string }>(
    "SELECT revision::text FROM dominio.revisiones_planificacion WHERE usuario_id = $1",
    [userId],
  );
  await pool.query(
    `INSERT INTO dominio.planes
     (id, usuario_id, estado, version_algoritmo, revision_origen,
      fecha_desde, fecha_hasta, sesion_minima, sesion_maxima, maximo_diario)
     VALUES ($1,$2,'active','deterministic-v2',$3,'2026-10-05','2026-10-06',25,90,240)`,
    [planId, userId, revision.rows[0]?.revision],
  );
  await pool.query(
    `INSERT INTO dominio.riesgos_plan
     (usuario_id, plan_id, actividad_id, minutos_restantes, minutos_capacidad,
      minutos_margen, nivel, razones)
     VALUES ($1,$2,$3,120,60,-60,'high',ARRAY['insufficient_capacity'])`,
    [userId, planId, activityId],
  );

  const firstAt = new Date("2026-10-05T08:00:00.000Z");
  expect(await scheduler.processDue(firstAt)).toBeGreaterThanOrEqual(1);
  const current = async () =>
    pool.query<{
      level: string;
      remainingMinutes: number;
      changedAt: Date;
      sourceRevision: string;
    }>(
      `SELECT nivel AS level, minutos_restantes AS "remainingMinutes",
         nivel_cambio_en AS "changedAt", revision_origen::text AS "sourceRevision"
       FROM dominio.riesgos_actuales WHERE usuario_id = $1 AND actividad_id = $2`,
      [userId, activityId],
    );
  const riskAlertCount = async () => {
    const result = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM dominio.notificaciones
       WHERE usuario_id = $1 AND actividad_id = $2 AND tipo = 'risk_alert'`,
      [userId, activityId],
    );
    return Number(result.rows[0]?.count ?? 0);
  };
  expect(await riskAlertCount()).toBe(1);
  expect(await assessor.processOne(firstAt)).toEqual({ kind: "assessed" });
  expect((await current()).rows[0]).toMatchObject({ level: "high", remainingMinutes: 120 });
  expect(await assessor.processOne(firstAt)).toEqual({ kind: "empty" });
  await scheduler.processDue(firstAt);
  expect(await riskAlertCount()).toBe(1);

  await pool.query(
    "UPDATE dominio.actividades SET porcentaje_progreso = 50, estado = 'in_progress' WHERE usuario_id = $1 AND id = $2",
    [userId, activityId],
  );
  const secondAt = new Date("2026-10-05T08:01:00.000Z");
  expect(await assessor.processOne(secondAt)).toEqual({ kind: "assessed" });
  expect((await current()).rows[0]).toMatchObject({ level: "medium", remainingMinutes: 60 });
  expect((await current()).rows[0]?.changedAt.toISOString()).toBe(secondAt.toISOString());
  await scheduler.processDue(secondAt);
  expect(await riskAlertCount()).toBe(1);

  await pool.query(
    "UPDATE dominio.actividades SET porcentaje_progreso = 0, estado = 'backlog' WHERE usuario_id = $1 AND id = $2",
    [userId, activityId],
  );
  const thirdAt = new Date("2026-10-05T08:02:00.000Z");
  expect(await assessor.processOne(thirdAt)).toEqual({ kind: "assessed" });
  expect((await current()).rows[0]).toMatchObject({ level: "high", remainingMinutes: 120 });
  expect((await current()).rows[0]?.changedAt.toISOString()).toBe(thirdAt.toISOString());
  await Promise.all([scheduler.processDue(thirdAt), scheduler.processDue(thirdAt)]);
  expect(await riskAlertCount()).toBe(2);
  await scheduler.processDue(thirdAt);
  expect(await riskAlertCount()).toBe(2);
  const stored = await pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM dominio.riesgos_plan WHERE usuario_id = $1 AND plan_id = $2",
    [userId, planId],
  );
  expect(stored.rows[0]?.count).toBe("1");

  const completedAt = new Date("2026-10-05T08:03:00.000Z");
  await pool.query(
    `UPDATE dominio.actividades SET porcentaje_progreso = 100, estado = 'completed',
       completado_en = $3 WHERE usuario_id = $1 AND id = $2`,
    [userId, activityId, completedAt],
  );
  expect(await assessor.processOne(completedAt)).toEqual({ kind: "assessed" });
  expect((await current()).rowCount).toBe(0);
  await scheduler.processDue(completedAt);
  expect(await riskAlertCount()).toBe(2);
});
