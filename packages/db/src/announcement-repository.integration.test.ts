import { afterAll, expect, test } from "bun:test";
import { Pool, type PoolClient } from "pg";
import { createAnnouncementRepository } from "./announcement-repository";

const source = process.env.DATABASE_URL;
if (!source) throw new Error("DATABASE_URL is required for announcement tests");
const target = new URL(source);
if (
  !["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
  target.pathname !== "/notesia_dev"
)
  throw new Error("Announcement tests only run against local notesia_dev");

const pool = new Pool({ connectionString: source, max: 3 });
const announcements = createAnnouncementRepository(pool);
const adminId = crypto.randomUUID();
const studentId = crypto.randomUUID();
const users = [adminId, studentId];

afterAll(async () => {
  // La auditoría es inmutable: sus filas de prueba se conservan, como en las demás pruebas.
  for (const id of users)
    await pool.query("DELETE FROM autenticacion.usuarios WHERE id = $1", [id]).catch(() => {});
  await pool.end();
});

async function createUser(id: string, name: string, client: Pool | PoolClient = pool) {
  await client.query(
    `INSERT INTO autenticacion.usuarios (id, nombre, correo, correo_verificado)
     VALUES ($1, $2, $3, true)`,
    [id, name, `announcement-${id}@example.test`],
  );
}

test("un aviso a un estudiante queda en su historial, encola el push y se audita", async () => {
  await createUser(adminId, "Admin avisos");
  await createUser(studentId, "Estudiante avisos");
  await pool.query(
    `INSERT INTO dominio.dispositivos_push (id, usuario_id, plataforma, token_cifrado)
     VALUES ($1, $2, 'android', $3)`,
    [crypto.randomUUID(), studentId, Buffer.from("cifrado-de-prueba")],
  );
  const id = crypto.randomUUID();
  const input = {
    id,
    title: "Mantenimiento",
    body: "Esta noche la app estará en pausa unos minutos.",
    recipientEmail: `ANNOUNCEMENT-${studentId}@EXAMPLE.TEST`,
  };
  const sent = await announcements.send(adminId, input);
  if (sent.kind !== "sent") throw new Error("no se envió");
  expect(sent.row.recipients).toBe(1);
  expect(sent.row.recipientEmail).toBe(`announcement-${studentId}@example.test`);

  const notice = await pool.query<{ id: string; pushes: number }>(
    `SELECT n.id, (SELECT count(*)::integer FROM dominio.envios_push e
       WHERE e.notificacion_id = n.id) AS pushes
     FROM dominio.notificaciones n
     WHERE n.usuario_id = $1 AND n.tipo = 'announcement' AND n.anuncio_id = $2`,
    [studentId, id],
  );
  expect(notice.rows).toHaveLength(1);
  expect(notice.rows[0]?.pushes).toBe(1);
  const audit = await pool.query(
    `SELECT 1 FROM dominio.auditoria_admin
     WHERE actor_id = $1 AND accion = 'announcement.sent' AND objetivo_id = $2`,
    [adminId, id],
  );
  expect(audit.rowCount).toBe(1);

  // Reintento con el mismo id: no duplica; con otro texto, se rechaza.
  expect((await announcements.send(adminId, input)).kind).toBe("sent");
  const again = await pool.query(
    `SELECT 1 FROM dominio.notificaciones WHERE usuario_id = $1 AND anuncio_id = $2`,
    [studentId, id],
  );
  expect(again.rowCount).toBe(1);
  expect(await announcements.send(adminId, { ...input, body: "Otro texto" })).toEqual({
    kind: "conflict",
  });
  expect(
    await announcements.send(adminId, {
      ...input,
      id: crypto.randomUUID(),
      recipientEmail: "nadie@example.test",
    }),
  ).toEqual({ kind: "recipient_not_found" });

  // Si el estudiante apagó los avisos, no le llega.
  await pool.query(
    "UPDATE dominio.preferencias_usuario SET notificaciones_habilitadas = false WHERE usuario_id = $1",
    [studentId],
  );
  const muted = await announcements.send(adminId, { ...input, id: crypto.randomUUID() });
  if (muted.kind !== "sent") throw new Error("no se envió");
  expect(muted.row.recipients).toBe(0);
  expect((await announcements.list(null)).some((row) => row.id === id)).toBe(true);
});

test("un aviso a todos no llega a cuentas suspendidas ni con avisos apagados", async () => {
  // Todo ocurre en una transacción que se revierte: no toca a los usuarios reales
  // de la base local ni el worker alcanza a ver esos avisos.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Los BEGIN/COMMIT del repositorio pasan a ser savepoints de esta transacción.
    const nested = {
      query: (statement: string, values?: unknown[]) => {
        if (statement === "BEGIN") return client.query("SAVEPOINT announcement");
        if (statement === "COMMIT") return client.query("RELEASE SAVEPOINT announcement");
        if (statement === "ROLLBACK") return client.query("ROLLBACK TO SAVEPOINT announcement");
        return client.query(statement, values);
      },
      release: () => {},
    };
    const scoped = createAnnouncementRepository({
      connect: async () => nested,
      query: (statement: string, values?: unknown[]) => client.query(statement, values),
    } as unknown as Pool);
    const active = crypto.randomUUID();
    const muted = crypto.randomUUID();
    const suspended = crypto.randomUUID();
    for (const id of [active, muted, suspended]) await createUser(id, "Prueba", client);
    await client.query(
      "UPDATE dominio.preferencias_usuario SET notificaciones_habilitadas = false WHERE usuario_id = $1",
      [muted],
    );
    await client.query("UPDATE autenticacion.usuarios SET suspendido_en = now() WHERE id = $1", [
      suspended,
    ]);
    const id = crypto.randomUUID();
    const sent = await scoped.send(adminId, {
      id,
      title: "Novedad",
      body: "Ya puedes ver tus avisos con su texto completo.",
      recipientEmail: null,
    });
    if (sent.kind !== "sent") throw new Error("no se envió");
    const reached = await client.query<{ usuario_id: string }>(
      `SELECT usuario_id FROM dominio.notificaciones
       WHERE anuncio_id = $1 AND usuario_id = ANY($2::uuid[])`,
      [id, [active, muted, suspended]],
    );
    expect(reached.rows.map((row) => row.usuario_id)).toEqual([active]);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
});
