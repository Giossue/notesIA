import type { Pool } from "pg";

/** Días que se conservan los planes reemplazados o descartados. */
export const OLD_PLAN_DAYS = 30;

/**
 * El plan automático crea un plan nuevo con cada cambio; los reemplazados,
 * descartados y borradores abandonados se borran después de `days` días. Se
 * conservan los que aún tienen avisos, para no borrar notificaciones del estudiante.
 */
export async function purgeOldPlans(pool: Pool, limit = 500, days = OLD_PLAN_DAYS) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw new Error("Invalid plan cleanup limit");
  const result = await pool.query(
    `WITH stale AS (
       SELECT p.usuario_id, p.id FROM dominio.planes p
       WHERE p.estado IN ('superseded', 'rejected', 'draft')
         AND p.creado_en <= now() - make_interval(days => $2)
         AND NOT EXISTS (SELECT 1 FROM dominio.notificaciones n
           WHERE n.usuario_id = p.usuario_id AND n.plan_id = p.id)
       ORDER BY p.creado_en, p.id LIMIT $1 FOR UPDATE SKIP LOCKED
     )
     DELETE FROM dominio.planes p USING stale
     WHERE p.usuario_id = stale.usuario_id AND p.id = stale.id`,
    [limit, days],
  );
  return result.rowCount ?? 0;
}
