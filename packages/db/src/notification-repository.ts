import type { Pool } from "pg";

type Notification = {
  id: string;
  type:
    | "plan_applied"
    | "deadline_reminder"
    | "block_reminder"
    | "risk_alert"
    | "streak_at_risk"
    | "report_updated";
  planId: string | null;
  reportId: string | null;
  activityId: string | null;
  blockId: string | null;
  referenceAt: Date | null;
  readAt: Date | null;
  version: number;
  createdAt: Date;
  cursorCreatedAt: string;
};
const columns = `id, tipo AS type, plan_id AS "planId", reporte_id AS "reportId",
  actividad_id AS "activityId", bloque_id AS "blockId",
  referencia_en AS "referenceAt", leida_en AS "readAt",
  version, creada_en AS "createdAt",
  to_char(creada_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    AS "cursorCreatedAt"`;

export function createNotificationRepository(pool: Pool) {
  return {
    async get(userId: string, id: string) {
      const result = await pool.query<Notification>(
        `select ${columns} from dominio.notificaciones where usuario_id = $1 and id = $2`,
        [userId, id],
      );
      return result.rows[0] ?? null;
    },
    async list(userId: string, cursor: { createdAt: string; id: string } | null) {
      const result = await pool.query<Notification>(
        `select ${columns} from dominio.notificaciones where usuario_id = $1
         and ($2::timestamptz is null or (creada_en, id) < ($2::timestamptz, $3::uuid))
         order by creada_en desc, id desc limit 21`,
        [userId, cursor?.createdAt ?? null, cursor?.id ?? null],
      );
      return result.rows;
    },
    async markRead(userId: string, id: string, version: number) {
      const result = await pool.query<Notification>(
        `update dominio.notificaciones set leida_en = now(), version = version + 1
         where usuario_id = $1 and id = $2 and version = $3 and leida_en is null
         returning ${columns}`,
        [userId, id, version],
      );
      return result.rows[0] ?? null;
    },
  };
}
export type NotificationRepository = ReturnType<typeof createNotificationRepository>;
