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

const pool = new Pool({ connectionString: databaseUrl });
const quietUserId = crypto.randomUUID();
const activeUserId = crypto.randomUUID();
const activeActivityId = crypto.randomUUID();
const dstUserId = crypto.randomUUID();
const dstActivityId = crypto.randomUUID();

afterAll(async () => {
  await pool.query("DELETE FROM autenticacion.usuarios WHERE id IN ($1, $2)", [
    quietUserId,
    activeUserId,
  ]);
  await pool.query("DELETE FROM autenticacion.usuarios WHERE id = $1", [dstUserId]);
  await pool.end();
});

test("quiet candidates cannot starve a due notice for another user", async () => {
  await pool.query(
    `INSERT INTO autenticacion.usuarios (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Usuario silencioso', $2, false), ($3, 'Usuario activo', $4, false)`,
    [
      quietUserId,
      `quiet-${quietUserId}@example.test`,
      activeUserId,
      `active-${activeUserId}@example.test`,
    ],
  );
  await pool.query(
    `UPDATE dominio.perfiles_usuario SET zona_horaria = 'Etc/UTC'
     WHERE usuario_id IN ($1, $2)`,
    [quietUserId, activeUserId],
  );
  await pool.query(
    `UPDATE dominio.preferencias_usuario
     SET minuto_silencio_inicio = 660, minuto_silencio_fin = 780
     WHERE usuario_id = $1`,
    [quietUserId],
  );
  await pool.query(
    `INSERT INTO dominio.actividades
       (id, usuario_id, tipo, titulo, prioridad, fecha_limite, minutos_estimados)
     SELECT gen_random_uuid(), $1, 'academic_task', 'Pendiente ' || n,
       'medium', '2027-12-05T13:00:00.000Z', 30
     FROM generate_series(1, 51) n`,
    [quietUserId],
  );
  await pool.query(
    `INSERT INTO dominio.actividades
       (id, usuario_id, tipo, titulo, prioridad, fecha_limite, minutos_estimados)
     VALUES ($1,$2,'academic_task','Avisar','medium','2027-12-05T14:00:00.000Z',30)`,
    [activeActivityId, activeUserId],
  );

  await createNotificationSchedulerRepository(pool).processDue(
    new Date("2027-12-05T12:00:00.000Z"),
    50,
  );
  const active = await pool.query<{ count: number }>(
    `SELECT count(*)::integer AS count FROM dominio.notificaciones
     WHERE usuario_id = $1 AND actividad_id = $2 AND tipo = 'deadline_reminder'`,
    [activeUserId, activeActivityId],
  );
  expect(active.rows[0]?.count).toBe(1);
  const quiet = await pool.query<{ count: number }>(
    `SELECT count(*)::integer AS count FROM dominio.notificaciones
     WHERE usuario_id = $1 AND tipo = 'deadline_reminder'`,
    [quietUserId],
  );
  expect(quiet.rows[0]?.count).toBe(0);
});

test("quiet hours use the local clock across a daylight saving change", async () => {
  await pool.query(
    `INSERT INTO autenticacion.usuarios (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Usuario DST', $2, false)`,
    [dstUserId, `dst-notice-${dstUserId}@example.test`],
  );
  await pool.query(
    `UPDATE dominio.perfiles_usuario SET zona_horaria = 'America/New_York'
     WHERE usuario_id = $1`,
    [dstUserId],
  );
  await pool.query(
    `UPDATE dominio.preferencias_usuario
     SET minuto_silencio_inicio = 120, minuto_silencio_fin = 240
     WHERE usuario_id = $1`,
    [dstUserId],
  );
  await pool.query(
    `INSERT INTO dominio.actividades
       (id, usuario_id, tipo, titulo, prioridad, fecha_limite, minutos_estimados)
     VALUES ($1,$2,'academic_task','Avisar DST','medium','2027-03-14T08:20:00.000Z',30)`,
    [dstActivityId, dstUserId],
  );
  const count = async () => {
    const result = await pool.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM dominio.notificaciones
       WHERE usuario_id = $1 AND actividad_id = $2 AND tipo = 'deadline_reminder'`,
      [dstUserId, dstActivityId],
    );
    return result.rows[0]?.count;
  };
  const scheduler = createNotificationSchedulerRepository(pool);
  await scheduler.processDue(new Date("2027-03-14T07:30:00.000Z"));
  expect(await count()).toBe(0);
  await scheduler.processDue(new Date("2027-03-14T08:00:00.000Z"));
  expect(await count()).toBe(1);
});
