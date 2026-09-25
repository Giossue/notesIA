import { currentTracePropagation, withTraceSpan } from "@notesia/observability";
import type { Pool, PoolClient } from "pg";

export async function queuePushForNotification(
  client: PoolClient,
  userId: string,
  notificationId: string,
) {
  await withTraceSpan(
    { name: "db.push.enqueue", component: "database", target: "postgresql" },
    async () => {
      const trace = currentTracePropagation();
      await client.query(
        `INSERT INTO dominio.envios_push
           (id, usuario_id, dispositivo_id, notificacion_id, traza_id, span_origen_id)
         SELECT gen_random_uuid(), d.usuario_id, d.id, $2, $3, $4
         FROM dominio.dispositivos_push d
         JOIN dominio.preferencias_usuario prefs ON prefs.usuario_id = d.usuario_id
         WHERE d.usuario_id = $1 AND prefs.notificaciones_habilitadas
           AND prefs.push_habilitado
           AND d.actualizado_en >= now() - interval '30 days'
         ON CONFLICT (notificacion_id, dispositivo_id) DO NOTHING`,
        [userId, notificationId, trace?.traceId ?? null, trace?.spanId ?? null],
      );
    },
  );
}

export function createPushDeviceRepository(pool: Pool) {
  return {
    async list(userId: string) {
      const result = await pool.query<{ id: string; platform: "android" | "ios"; updatedAt: Date }>(
        `SELECT id, plataforma AS platform, actualizado_en AS "updatedAt"
         FROM dominio.dispositivos_push WHERE usuario_id = $1
         ORDER BY actualizado_en DESC, id DESC`,
        [userId],
      );
      return result.rows;
    },
    async upsert(
      userId: string,
      deviceId: string,
      platform: "android" | "ios",
      encryptedToken: Buffer,
    ) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `push-devices:${userId}`,
        ]);
        const count = await client.query<{ count: string; exists: boolean }>(
          `SELECT count(*)::text AS count, bool_or(id = $2) AS exists
           FROM dominio.dispositivos_push WHERE usuario_id = $1`,
          [userId, deviceId],
        );
        if (!count.rows[0]?.exists && Number(count.rows[0]?.count ?? 0) >= 5) {
          await client.query("ROLLBACK");
          return { kind: "limit_reached" as const };
        }
        await client.query(
          `INSERT INTO dominio.dispositivos_push
           (usuario_id, id, plataforma, token_cifrado) VALUES ($1,$2,$3,$4)
           ON CONFLICT (usuario_id, id) DO UPDATE SET plataforma = EXCLUDED.plataforma,
             token_cifrado = EXCLUDED.token_cifrado, actualizado_en = now()`,
          [userId, deviceId, platform, encryptedToken],
        );
        await client.query("COMMIT");
        return { kind: "saved" as const };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    async remove(userId: string, deviceId: string) {
      const result = await pool.query(
        "DELETE FROM dominio.dispositivos_push WHERE usuario_id = $1 AND id = $2",
        [userId, deviceId],
      );
      return result.rowCount === 1;
    },
  };
}
export type PushDeviceRepository = ReturnType<typeof createPushDeviceRepository>;
