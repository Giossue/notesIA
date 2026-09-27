import { afterAll, expect, test } from "bun:test";
import { Pool } from "pg";
import { purgeOldNotifications } from "./notification-cleanup";

const source = process.env.DATABASE_URL;
if (!source) throw new Error("DATABASE_URL is required for notification cleanup tests");
const target = new URL(source);
if (
  !["127.0.0.1", "localhost", "::1"].includes(target.hostname) ||
  target.pathname !== "/notesia_dev"
)
  throw new Error("Notification cleanup tests only run against local notesia_dev");

const pool = new Pool({ connectionString: source, max: 1 });
afterAll(() => pool.end());

test("borra avisos leídos viejos y los muy viejos, y conserva los recientes", async () => {
  // En una transacción que se revierte: no borra los avisos reales de la base local.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const userId = crypto.randomUUID();
    await client.query(
      `INSERT INTO autenticacion.usuarios (id, nombre, correo, correo_verificado)
       VALUES ($1, 'Prueba limpieza', $2, true)`,
      [userId, `cleanup-${userId}@example.test`],
    );
    let count = 0;
    const notice = async (daysAgo: number, read: boolean) => {
      const id = crypto.randomUUID();
      await client.query(
        `INSERT INTO dominio.notificaciones (id, usuario_id, tipo, referencia_en, creada_en, leida_en)
         VALUES ($1, $2, 'streak_at_risk', now() - make_interval(days => $3, mins => $5),
           now() - make_interval(days => $3),
           CASE WHEN $4 THEN now() - make_interval(days => $3) END)`,
        [id, userId, daysAgo, read, ++count],
      );
      return id;
    };
    const oldRead = await notice(100, true);
    const oldUnread = await notice(100, false);
    const ancientUnread = await notice(200, false);
    const recentRead = await notice(10, true);

    await purgeOldNotifications(client as unknown as Pool);
    const left = await client.query<{ id: string }>(
      "SELECT id FROM dominio.notificaciones WHERE usuario_id = $1",
      [userId],
    );
    const ids = left.rows.map((row) => row.id);
    expect(ids).not.toContain(oldRead);
    expect(ids).not.toContain(ancientUnread);
    expect(ids).toContain(oldUnread);
    expect(ids).toContain(recentRead);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
});
