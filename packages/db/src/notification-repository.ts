import type { Pool } from "pg";

type Notification = {
  id: string;
  type:
    | "plan_applied"
    | "deadline_reminder"
    | "block_reminder"
    | "risk_alert"
    | "streak_at_risk"
    | "report_updated"
    | "announcement";
  planId: string | null;
  reportId: string | null;
  activityId: string | null;
  blockId: string | null;
  referenceAt: Date | null;
  readAt: Date | null;
  version: number;
  createdAt: Date;
  cursorCreatedAt: string;
  /** Para escribir el mismo texto que el push. */
  activityTitle: string | null;
  announcementTitle: string | null;
  announcementBody: string | null;
  timeZone: string;
};
const columns = `n.id, n.tipo AS type, n.plan_id AS "planId", n.reporte_id AS "reportId",
  n.actividad_id AS "activityId", n.bloque_id AS "blockId",
  n.referencia_en AS "referenceAt", n.leida_en AS "readAt",
  n.version, n.creada_en AS "createdAt",
  to_char(n.creada_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    AS "cursorCreatedAt",
  coalesce(a.titulo, report.titulo) AS "activityTitle",
  announcement.titulo AS "announcementTitle", announcement.cuerpo AS "announcementBody",
  coalesce(profile.zona_horaria, 'UTC') AS "timeZone"`;
const joins = `LEFT JOIN dominio.actividades a ON a.usuario_id = n.usuario_id AND a.id = n.actividad_id
  LEFT JOIN dominio.reportes report ON report.id = n.reporte_id
  LEFT JOIN dominio.anuncios announcement ON announcement.id = n.anuncio_id
  LEFT JOIN dominio.perfiles_usuario profile ON profile.usuario_id = n.usuario_id`;

export function createNotificationRepository(pool: Pool) {
  const get = async (userId: string, id: string) => {
    const result = await pool.query<Notification>(
      `select ${columns} from dominio.notificaciones n ${joins}
       where n.usuario_id = $1 and n.id = $2`,
      [userId, id],
    );
    return result.rows[0] ?? null;
  };
  return {
    get,
    async list(userId: string, cursor: { createdAt: string; id: string } | null) {
      const result = await pool.query<Notification>(
        `select ${columns} from dominio.notificaciones n ${joins} where n.usuario_id = $1
         and ($2::timestamptz is null or (n.creada_en, n.id) < ($2::timestamptz, $3::uuid))
         order by n.creada_en desc, n.id desc limit 21`,
        [userId, cursor?.createdAt ?? null, cursor?.id ?? null],
      );
      return result.rows;
    },
    async unreadCount(userId: string) {
      const result = await pool.query<{ count: number }>(
        `select count(*)::integer as count from dominio.notificaciones
         where usuario_id = $1 and leida_en is null`,
        [userId],
      );
      return result.rows[0]?.count ?? 0;
    },
    async markRead(userId: string, id: string, version: number) {
      const updated = await pool.query<{ id: string }>(
        `update dominio.notificaciones set leida_en = now(), version = version + 1
         where usuario_id = $1 and id = $2 and version = $3 and leida_en is null
         returning id`,
        [userId, id, version],
      );
      return updated.rowCount ? get(userId, id) : null;
    },
    /** Marca como leídos todos los avisos creados hasta `until` (lo que el estudiante vio). */
    async markAllRead(userId: string, until: Date) {
      const result = await pool.query(
        `update dominio.notificaciones set leida_en = now(), version = version + 1
         where usuario_id = $1 and leida_en is null and creada_en <= $2`,
        [userId, until],
      );
      return result.rowCount ?? 0;
    },
  };
}
export type NotificationRepository = ReturnType<typeof createNotificationRepository>;
