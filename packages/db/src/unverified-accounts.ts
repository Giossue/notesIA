import type { Pool } from "pg";

/** Horas que una cuenta puede quedar sin verificar antes de borrarse. */
export const UNVERIFIED_ACCOUNT_HOURS = 24;

/**
 * Borra las cuentas que nunca verificaron su correo. Así un correo mal escrito
 * no queda ocupado para siempre y su dueño real puede registrarse. Las cuentas
 * de administración no se tocan. Todo lo de la cuenta cae en cascada.
 */
export async function purgeUnverifiedAccounts(
  pool: Pool,
  limit = 500,
  hours = UNVERIFIED_ACCOUNT_HOURS,
) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw new Error("Invalid unverified account cleanup limit");
  const result = await pool.query(
    `WITH stale AS (
       SELECT u.id FROM autenticacion.usuarios u
       WHERE u.correo_verificado = false
         AND u.creado_en <= now() - make_interval(hours => $2)
         AND NOT EXISTS (SELECT 1 FROM autenticacion.roles_usuario r WHERE r.usuario_id = u.id)
       ORDER BY u.creado_en, u.id LIMIT $1 FOR UPDATE SKIP LOCKED
     )
     DELETE FROM autenticacion.usuarios u USING stale WHERE u.id = stale.id`,
    [limit, hours],
  );
  return result.rowCount ?? 0;
}
