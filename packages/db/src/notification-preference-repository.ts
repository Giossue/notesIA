import type { Pool } from "pg";

export type NotificationPreference = {
  deadlineLeadMinutes: number;
  blockLeadMinutes: number;
  riskCooldownMinutes: number;
  version: number;
  updatedAt: Date;
};
const columns = `anticipacion_plazo_minutos AS "deadlineLeadMinutes",
  anticipacion_bloque_minutos AS "blockLeadMinutes",
  enfriamiento_riesgo_minutos AS "riskCooldownMinutes", version,
  actualizado_en AS "updatedAt"`;

export function createNotificationPreferenceRepository(pool: Pool) {
  return {
    async get(userId: string) {
      const result = await pool.query<NotificationPreference>(
        `SELECT ${columns} FROM dominio.preferencias_avisos WHERE usuario_id = $1`,
        [userId],
      );
      return result.rows[0] ?? null;
    },
    async update(
      userId: string,
      input: {
        deadlineLeadMinutes: number;
        blockLeadMinutes: number;
        riskCooldownMinutes: number;
        version: number;
      },
    ) {
      const result = await pool.query<NotificationPreference>(
        `UPDATE dominio.preferencias_avisos SET
          anticipacion_plazo_minutos = $2, anticipacion_bloque_minutos = $3,
          enfriamiento_riesgo_minutos = $4, version = version + 1,
          actualizado_en = now()
         WHERE usuario_id = $1 AND version = $5 RETURNING ${columns}`,
        [
          userId,
          input.deadlineLeadMinutes,
          input.blockLeadMinutes,
          input.riskCooldownMinutes,
          input.version,
        ],
      );
      return result.rows[0] ?? null;
    },
  };
}
export type NotificationPreferenceRepository = ReturnType<
  typeof createNotificationPreferenceRepository
>;
