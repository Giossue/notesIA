import { afterAll, expect, test } from "bun:test";
import { Pool } from "pg";
import { createAutoPlanner } from "./auto-planner";

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("DATABASE_URL is required for auto-plan integration tests");
const target = new URL(sourceUrl);
if (
  !["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
  target.pathname !== "/notesia_dev"
)
  throw new Error("Auto-plan integration tests only run against local notesia_dev");

const pool = new Pool({ connectionString: sourceUrl });
const planner = createAutoPlanner(pool);
const userId = crypto.randomUUID();

afterAll(async () => {
  await pool.query("DELETE FROM autenticacion.usuarios WHERE id = $1", [userId]);
  await pool.end();
});

const activePlan = async () =>
  (
    await pool.query<{ id: string; from: string; blocks: number }>(
      `SELECT p.id, p.fecha_desde::text AS "from",
         (SELECT count(*)::int FROM dominio.bloques_plan b
          WHERE b.usuario_id = p.usuario_id AND b.plan_id = p.id) AS blocks
       FROM dominio.planes p WHERE p.usuario_id = $1 AND p.estado = 'active'`,
      [userId],
    )
  ).rows[0];

test("the worker plans automatically after onboarding and replans when data changes", async () => {
  await pool.query(
    `INSERT INTO autenticacion.usuarios (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Prueba plan automático', $2, false)`,
    [userId, `auto-plan-${userId}@example.test`],
  );
  await pool.query(
    "UPDATE dominio.perfiles_usuario SET zona_horaria = 'Etc/UTC' WHERE usuario_id = $1",
    [userId],
  );
  // Lunes a viernes de 15:00 a 18:00.
  for (const weekday of [1, 2, 3, 4, 5])
    await pool.query(
      `INSERT INTO dominio.reglas_disponibilidad
       (id, usuario_id, dia_semana, minuto_inicio, minuto_fin) VALUES ($1,$2,$3,900,1080)`,
      [crypto.randomUUID(), userId, weekday],
    );
  await pool.query(
    `INSERT INTO dominio.actividades
     (id, usuario_id, tipo, titulo, prioridad, fecha_limite, minutos_estimados)
     VALUES ($1,$2,'academic_task','Ensayo','high','2027-03-12T23:00:00Z',120)`,
    [crypto.randomUUID(), userId],
  );
  // Lunes 8 de marzo de 2027, 08:00 UTC.
  const now = new Date("2027-03-08T08:00:00Z");

  // Sin onboarding terminado no se planifica.
  expect((await planner.processOne(now, userId)).kind).toBe("empty");
  await pool.query(
    "UPDATE dominio.perfiles_usuario SET onboarding_completado_en = now() WHERE usuario_id = $1",
    [userId],
  );

  expect((await planner.processOne(now, userId)).kind).toBe("planned");
  const first = await activePlan();
  expect(first).toMatchObject({ from: "2027-03-08" });
  expect(first?.blocks).toBeGreaterThan(0);
  // Nada cambió: no vuelve a planificar.
  expect((await planner.processOne(now, userId)).kind).toBe("empty");
  // Sin aviso "Plan aplicado".
  const outbox = await pool.query("SELECT 1 FROM dominio.bandeja_salida WHERE usuario_id = $1", [
    userId,
  ]);
  expect(outbox.rowCount).toBe(0);

  // Una tarea nueva cambia la revisión y el plan se rehace.
  await pool.query(
    `INSERT INTO dominio.actividades
     (id, usuario_id, tipo, titulo, prioridad, fecha_limite, minutos_estimados)
     VALUES ($1,$2,'academic_task','Lectura','medium','2027-03-11T23:00:00Z',60)`,
    [crypto.randomUUID(), userId],
  );
  expect((await planner.processOne(now, userId)).kind).toBe("planned");
  const second = await activePlan();
  expect(second?.id).not.toBe(first?.id);

  // Al día siguiente se rehace desde ese día.
  expect((await planner.processOne(new Date("2027-03-09T08:00:00Z"), userId)).kind).toBe("planned");
  expect((await activePlan())?.from).toBe("2027-03-09");
});
