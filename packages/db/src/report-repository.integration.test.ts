import { afterAll, expect, test } from "bun:test";
import { Pool } from "pg";
import { createReportRepository } from "./report-repository";

const source = process.env.DATABASE_URL;
if (!source) throw new Error("DATABASE_URL is required for report integration tests");
const target = new URL(source);
if (
  !["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
  target.pathname !== "/notesia_dev"
)
  throw new Error("Report integration tests only run against local notesia_dev");

const pool = new Pool({ connectionString: source, max: 2 });
const reports = createReportRepository(pool);
const studentId = crypto.randomUUID();
const supportId = crypto.randomUUID();

afterAll(async () => {
  await pool.query("DELETE FROM autenticacion.usuarios WHERE id = ANY($1::uuid[])", [
    [studentId, supportId],
  ]);
  await pool.end();
});

test("a student reports, support replies and resolves, and the student is notified", async () => {
  for (const [id, label] of [
    [studentId, "student"],
    [supportId, "support"],
  ])
    await pool.query(
      `INSERT INTO autenticacion.usuarios (id, nombre, correo, correo_verificado)
       VALUES ($1, 'Prueba reportes', $2, true)`,
      [id, `report-${label}-${id}@example.test`],
    );
  const input = {
    id: crypto.randomUUID(),
    type: "bug" as const,
    title: "No carga la agenda",
    description: "Al abrir la agenda se queda en blanco.",
    context: { platform: "android", osVersion: "35", appVersion: "1.0" },
  };
  const created = await reports.create(studentId, input);
  expect(created).toMatchObject({ status: "new", reply: null, version: 1 });
  // Reintentar con el mismo id no duplica.
  await reports.create(studentId, input);
  expect(await reports.listMine(studentId)).toHaveLength(1);

  expect(await reports.adminUpdate(supportId, input.id, { version: 1, assignToMe: true })).toEqual({
    kind: "updated",
  });
  expect(await reports.adminUpdate(supportId, input.id, { version: 1, reply: "Tarde" })).toEqual({
    kind: "version_conflict",
  });
  await reports.adminUpdate(supportId, input.id, {
    version: 2,
    reply: "Ya lo corregimos, actualiza la app.",
    status: "resolved",
  });

  const detail = await reports.adminGet(input.id);
  expect(detail).toMatchObject({
    status: "resolved",
    assigneeId: supportId,
    reply: "Ya lo corregimos, actualiza la app.",
    closedAt: expect.any(Date),
  });
  expect(detail?.history.map((item) => item.action)).toEqual([
    "created",
    "assigned",
    "status_changed",
    "status_changed",
    "replied",
  ]);
  const notices = await pool.query(
    "SELECT 1 FROM dominio.notificaciones WHERE usuario_id = $1 AND tipo = 'report_updated'",
    [studentId],
  );
  expect(notices.rowCount).toBe(1);
});
