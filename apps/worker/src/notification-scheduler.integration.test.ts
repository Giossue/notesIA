import { afterAll, expect, test } from "bun:test";
import { createNotificationSchedulerRepository } from "@notesia/db";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for notification integration tests");
const target = new URL(databaseUrl);
if (
  !["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
  target.pathname !== "/notesia_dev"
)
  throw new Error("Notification integration tests only run against local notesia_dev");

const pool = new Pool({ connectionString: databaseUrl, max: 3 });
const userId = crypto.randomUUID();
const activityId = crypto.randomUUID();
const blockUserId = crypto.randomUUID();
const quietChangeUserId = crypto.randomUUID();
const quietChangeActivityId = crypto.randomUUID();
const zoneChangeUserId = crypto.randomUUID();
const zoneChangeActivityId = crypto.randomUUID();

afterAll(async () => {
  await pool.query("DELETE FROM autenticacion.usuarios WHERE id = $1", [userId]);
  await pool.query("DELETE FROM autenticacion.usuarios WHERE id = $1", [blockUserId]);
  await pool.query("DELETE FROM autenticacion.usuarios WHERE id = $1", [quietChangeUserId]);
  await pool.query("DELETE FROM autenticacion.usuarios WHERE id = $1", [zoneChangeUserId]);
  await pool.end();
});

test("a completed activity does not receive a deadline notice selected earlier", async () => {
  await pool.query(
    `INSERT INTO autenticacion.usuarios (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Prueba avisos', $2, false)`,
    [userId, `notice-race-${userId}@example.test`],
  );
  await pool.query(
    "UPDATE dominio.perfiles_usuario SET zona_horaria = 'Etc/UTC' WHERE usuario_id = $1",
    [userId],
  );
  await pool.query(
    `INSERT INTO dominio.actividades
     (id, usuario_id, tipo, titulo, prioridad, fecha_limite, minutos_estimados)
     VALUES ($1,$2,'academic_task','Informe','high','2026-10-06T11:00:00.000Z',60)`,
    [activityId, userId],
  );

  let completedDuringInsert = false;
  const interleavedPool = {
    query: async (statement: string, values?: unknown[]) => {
      if (statement.includes("INSERT INTO dominio.notificaciones") && values?.[1] === userId) {
        await pool.query(
          `UPDATE dominio.actividades SET estado = 'completed',
             porcentaje_progreso = 100, completado_en = now()
           WHERE usuario_id = $1 AND id = $2`,
          [userId, activityId],
        );
        completedDuringInsert = true;
      }
      return pool.query(statement, values);
    },
    connect: () => pool.connect(),
  } as unknown as Pool;
  await createNotificationSchedulerRepository(interleavedPool).processDue(
    new Date("2026-10-05T12:00:00.000Z"),
  );
  expect(completedDuringInsert).toBe(true);
  const result = await pool.query<{ count: number }>(
    `SELECT count(*)::integer AS count FROM dominio.notificaciones
     WHERE usuario_id = $1 AND actividad_id = $2 AND tipo = 'deadline_reminder'`,
    [userId, activityId],
  );
  expect(result.rows[0]?.count).toBe(0);
});

test("a deadline inside quiet hours is still recorded; only the push waits", async () => {
  await pool.query(
    `INSERT INTO autenticacion.usuarios (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Prueba silencio', $2, false)`,
    [quietChangeUserId, `quiet-change-${quietChangeUserId}@example.test`],
  );
  await pool.query(
    "UPDATE dominio.perfiles_usuario SET zona_horaria = 'Etc/UTC' WHERE usuario_id = $1",
    [quietChangeUserId],
  );
  // Silencio de 11:00 a 13:00 y la entrega vence a las 12:30: antes, el aviso
  // se perdía porque el plazo pasaba antes de que terminara el silencio.
  await pool.query(
    `UPDATE dominio.preferencias_usuario
     SET minuto_silencio_inicio = 660, minuto_silencio_fin = 780
     WHERE usuario_id = $1`,
    [quietChangeUserId],
  );
  await pool.query(
    `INSERT INTO dominio.actividades
     (id, usuario_id, tipo, titulo, prioridad, fecha_limite, minutos_estimados)
     VALUES ($1,$2,'academic_task','Informe','high','2027-05-05T12:30:00.000Z',60)`,
    [quietChangeActivityId, quietChangeUserId],
  );
  await createNotificationSchedulerRepository(pool).processDue(
    new Date("2027-05-05T12:00:00.000Z"),
  );
  const result = await pool.query<{ count: number }>(
    `SELECT count(*)::integer AS count FROM dominio.notificaciones
     WHERE usuario_id = $1 AND actividad_id = $2 AND tipo = 'deadline_reminder'`,
    [quietChangeUserId, quietChangeActivityId],
  );
  expect(result.rows[0]?.count).toBe(1);
});

test("turning notices off before insertion suppresses the selected notice", async () => {
  await pool.query(
    `INSERT INTO autenticacion.usuarios (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Prueba apagado', $2, false)`,
    [zoneChangeUserId, `off-change-${zoneChangeUserId}@example.test`],
  );
  await pool.query(
    "UPDATE dominio.perfiles_usuario SET zona_horaria = 'Etc/UTC' WHERE usuario_id = $1",
    [zoneChangeUserId],
  );
  await pool.query(
    `INSERT INTO dominio.actividades
     (id, usuario_id, tipo, titulo, prioridad, fecha_limite, minutos_estimados)
     VALUES ($1,$2,'academic_task','Informe','high','2027-06-05T13:00:00.000Z',60)`,
    [zoneChangeActivityId, zoneChangeUserId],
  );
  let changed = false;
  const interleavedPool = {
    query: async (statement: string, values?: unknown[]) => {
      if (
        !changed &&
        statement.includes("INSERT INTO dominio.notificaciones") &&
        values?.[1] === zoneChangeUserId
      ) {
        changed = true;
        await pool.query(
          `UPDATE dominio.preferencias_usuario SET notificaciones_habilitadas = false
           WHERE usuario_id = $1`,
          [zoneChangeUserId],
        );
      }
      return pool.query(statement, values);
    },
    connect: () => pool.connect(),
  } as unknown as Pool;
  const now = new Date("2027-06-05T12:00:00.000Z");
  const count = async () => {
    const result = await pool.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM dominio.notificaciones
       WHERE usuario_id = $1 AND actividad_id = $2 AND tipo = 'deadline_reminder'`,
      [zoneChangeUserId, zoneChangeActivityId],
    );
    return result.rows[0]?.count;
  };
  await createNotificationSchedulerRepository(interleavedPool).processDue(now);
  expect(changed).toBe(true);
  expect(await count()).toBe(0);
  await pool.query(
    `UPDATE dominio.preferencias_usuario SET notificaciones_habilitadas = true
     WHERE usuario_id = $1`,
    [zoneChangeUserId],
  );
  await createNotificationSchedulerRepository(pool).processDue(now);
  expect(await count()).toBe(1);
});

test("a superseded plan does not receive a block notice selected earlier", async () => {
  const blockActivityId = crypto.randomUUID();
  const planId = crypto.randomUUID();
  const blockId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO autenticacion.usuarios (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Prueba bloque', $2, false)`,
    [blockUserId, `block-race-${blockUserId}@example.test`],
  );
  await pool.query(
    "UPDATE dominio.perfiles_usuario SET zona_horaria = 'Etc/UTC' WHERE usuario_id = $1",
    [blockUserId],
  );
  await pool.query(
    `INSERT INTO dominio.actividades
     (id, usuario_id, tipo, titulo, prioridad, fecha_limite, minutos_estimados)
     VALUES ($1,$2,'academic_task','Informe','high','2026-10-15T12:00:00.000Z',60)`,
    [blockActivityId, blockUserId],
  );
  const revision = await pool.query<{ value: string }>(
    `SELECT revision::text AS value FROM dominio.revisiones_planificacion WHERE usuario_id = $1`,
    [blockUserId],
  );
  await pool.query(
    `INSERT INTO dominio.planes
       (id, usuario_id, estado, version_algoritmo, revision_origen,
        fecha_desde, fecha_hasta, sesion_minima, sesion_maxima, maximo_diario)
     VALUES ($1,$2,'active','deterministic-v2',$3,'2026-10-05','2026-10-06',25,90,240)`,
    [planId, blockUserId, revision.rows[0]?.value],
  );
  await pool.query(
    `INSERT INTO dominio.bloques_plan
       (id, usuario_id, plan_id, actividad_id, inicia_en, termina_en)
     VALUES ($1,$2,$3,$4,'2026-10-05T12:10:00.000Z','2026-10-05T12:40:00.000Z')`,
    [blockId, blockUserId, planId, blockActivityId],
  );

  let supersededDuringInsert = false;
  const interleavedPool = {
    query: async (statement: string, values?: unknown[]) => {
      if (statement.includes("INSERT INTO dominio.notificaciones") && values?.[1] === blockUserId) {
        await pool.query(
          "UPDATE dominio.planes SET estado = 'superseded' WHERE usuario_id = $1 AND id = $2",
          [blockUserId, planId],
        );
        supersededDuringInsert = true;
      }
      return pool.query(statement, values);
    },
    connect: () => pool.connect(),
  } as unknown as Pool;
  await createNotificationSchedulerRepository(interleavedPool).processDue(
    new Date("2026-10-05T12:00:00.000Z"),
  );
  expect(supersededDuringInsert).toBe(true);
  const result = await pool.query<{ count: number }>(
    `SELECT count(*)::integer AS count FROM dominio.notificaciones
     WHERE usuario_id = $1 AND bloque_id = $2 AND tipo = 'block_reminder'`,
    [blockUserId, blockId],
  );
  expect(result.rows[0]?.count).toBe(0);
});

test("completing an activity earns the day and an unfinished streak is warned once at night", async () => {
  const streakUserId = crypto.randomUUID();
  const streakActivityId = crypto.randomUUID();
  try {
    await pool.query(
      `INSERT INTO autenticacion.usuarios (id, nombre, correo, correo_verificado)
       VALUES ($1, 'Prueba racha', $2, false)`,
      [streakUserId, `streak-${streakUserId}@example.test`],
    );
    await pool.query(
      "UPDATE dominio.perfiles_usuario SET zona_horaria = 'Etc/UTC' WHERE usuario_id = $1",
      [streakUserId],
    );
    await pool.query(
      `INSERT INTO dominio.actividades (id, usuario_id, tipo, titulo, prioridad)
       VALUES ($1,$2,'academic_task','Lectura','medium')`,
      [streakActivityId, streakUserId],
    );
    await pool.query(
      `UPDATE dominio.actividades SET estado = 'completed', porcentaje_progreso = 100,
         completado_en = '2027-06-01T10:00:00Z' WHERE id = $1`,
      [streakActivityId],
    );
    // Reabrir no borra el día ganado.
    await pool.query(
      `UPDATE dominio.actividades SET estado = 'backlog', porcentaje_progreso = 0,
         completado_en = NULL WHERE id = $1`,
      [streakActivityId],
    );
    const days = await pool.query<{ day: string }>(
      "SELECT fecha::text AS day FROM dominio.dias_racha WHERE usuario_id = $1",
      [streakUserId],
    );
    expect(days.rows.map((row) => row.day)).toEqual(["2027-06-01"]);

    const notices = async () => {
      const result = await pool.query<{ count: number }>(
        `SELECT count(*)::integer AS count FROM dominio.notificaciones
         WHERE usuario_id = $1 AND tipo = 'streak_at_risk'`,
        [streakUserId],
      );
      return result.rows[0]?.count;
    };
    const scheduler = createNotificationSchedulerRepository(pool);
    await scheduler.processDue(new Date("2027-06-02T19:00:00.000Z"));
    expect(await notices()).toBe(0);
    await scheduler.processDue(new Date("2027-06-02T20:30:00.000Z"));
    await scheduler.processDue(new Date("2027-06-02T21:00:00.000Z"));
    expect(await notices()).toBe(1);
  } finally {
    await pool.query("DELETE FROM autenticacion.usuarios WHERE id = $1", [streakUserId]);
  }
});
