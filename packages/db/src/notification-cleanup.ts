import type { Pool } from "pg";

/** Días que se conserva un aviso ya leído en el historial del estudiante. */
export const READ_NOTIFICATION_DAYS = 90;
/** Días que se conserva cualquier aviso, aunque no se haya leído. */
export const NOTIFICATION_DAYS = 180;
/** Días que se conserva el registro de un envío push terminado. */
export const FINISHED_PUSH_DAYS = 30;

/**
 * Borra de a `limit` los avisos viejos (con sus envíos push) y los envíos
 * push terminados. Ningún aviso nuevo depende de uno tan viejo: los
 * recordatorios se crean como mucho 7 días antes de lo que anuncian. Devuelve
 * cuántas filas borró, para seguir si quedó trabajo.
 */
export async function purgeOldNotifications(pool: Pool, limit = 500) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw new Error("Invalid notification cleanup limit");
  const notices = await pool.query(
    `WITH stale AS (
       SELECT usuario_id, id FROM dominio.notificaciones
       WHERE creada_en <= now() - make_interval(days => $2)
         AND (leida_en IS NOT NULL OR creada_en <= now() - make_interval(days => $3))
       ORDER BY creada_en, id LIMIT $1 FOR UPDATE SKIP LOCKED
     )
     DELETE FROM dominio.notificaciones n USING stale
     WHERE n.usuario_id = stale.usuario_id AND n.id = stale.id`,
    [limit, READ_NOTIFICATION_DAYS, NOTIFICATION_DAYS],
  );
  const pushes = await pool.query(
    `WITH finished AS (
       SELECT id FROM dominio.envios_push
       WHERE estado IN ('done', 'dead') AND creado_en <= now() - make_interval(days => $2)
       ORDER BY creado_en, id LIMIT $1 FOR UPDATE SKIP LOCKED
     )
     DELETE FROM dominio.envios_push e USING finished WHERE e.id = finished.id`,
    [limit, FINISHED_PUSH_DAYS],
  );
  return Math.max(notices.rowCount ?? 0, pushes.rowCount ?? 0);
}
