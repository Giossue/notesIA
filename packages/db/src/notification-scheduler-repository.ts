import { currentTracePropagation, withTraceSpan } from "@notesia/observability";
import type { Pool, PoolClient } from "pg";

type Candidate = {
  userId: string;
  activityId: string | null;
  planId: string | null;
  blockId: string | null;
  referenceAt: Date | null;
  timeZone: string;
  quietStartMinute: number;
  quietEndMinute: number;
  riskSource?: "snapshot" | "stored";
  levelChangedAt?: Date | null;
};

export function isQuietAt(now: Date, timeZone: string, start: number, end: number) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const localMinute = hour * 60 + minute;
  return start < end
    ? localMinute >= start && localMinute < end
    : localMinute >= start || localMinute < end;
}

/** Hora local (en minutos) desde la que se avisa que la racha está en peligro: 20:00. */
export const STREAK_REMINDER_MINUTE = 20 * 60;

const candidateColumns = `a.usuario_id AS "userId", a.id AS "activityId",
  profile.zona_horaria AS "timeZone",
  prefs.minuto_silencio_inicio AS "quietStartMinute",
  prefs.minuto_silencio_fin AS "quietEndMinute"`;
const localClockJoin = (parameter: 1 | 8) => `CROSS JOIN LATERAL (
  SELECT EXTRACT(HOUR FROM timezone(profile.zona_horaria, $${parameter}::timestamptz))::integer * 60 +
    EXTRACT(MINUTE FROM timezone(profile.zona_horaria, $${parameter}::timestamptz))::integer
    AS local_minute
) local_clock`;
const outsideQuietHours = `NOT (
  CASE WHEN prefs.minuto_silencio_inicio < prefs.minuto_silencio_fin
    THEN local_clock.local_minute >= prefs.minuto_silencio_inicio
      AND local_clock.local_minute < prefs.minuto_silencio_fin
    ELSE local_clock.local_minute >= prefs.minuto_silencio_inicio
      OR local_clock.local_minute < prefs.minuto_silencio_fin
  END
)`;

async function insertNotice(
  connection: Pool | PoolClient,
  type: "deadline_reminder" | "block_reminder" | "risk_alert" | "streak_at_risk",
  row: Candidate,
  now: Date,
) {
  return withTraceSpan(
    { name: "db.push.enqueue", component: "database", target: "postgresql" },
    async () => {
      const trace = currentTracePropagation();
      const eligibleSource =
        type === "deadline_reminder"
          ? `SELECT a.usuario_id FROM dominio.actividades a
         JOIN dominio.preferencias_avisos notice ON notice.usuario_id = a.usuario_id
         WHERE a.usuario_id = $2 AND a.id = $5 AND a.fecha_limite = $7
           AND a.fecha_limite > $8::timestamptz
           AND a.fecha_limite <= $8::timestamptz +
             notice.anticipacion_plazo_minutos * interval '1 minute'
           AND a.estado NOT IN ('completed','cancelled')
           AND a.eliminado_en IS NULL AND a.archivado_en IS NULL
         FOR SHARE OF a`
          : type === "block_reminder"
            ? `SELECT b.usuario_id FROM dominio.bloques_plan b
           JOIN dominio.planes p ON p.usuario_id = b.usuario_id AND p.id = b.plan_id
           JOIN dominio.actividades a ON a.usuario_id = b.usuario_id AND a.id = b.actividad_id
           JOIN dominio.preferencias_avisos notice ON notice.usuario_id = b.usuario_id
           WHERE b.usuario_id = $2 AND b.id = $6 AND p.id = $4
             AND a.id = $5 AND b.inicia_en = $7 AND p.estado = 'active'
             AND b.inicia_en > $8::timestamptz
             AND b.inicia_en <= $8::timestamptz +
               notice.anticipacion_bloque_minutos * interval '1 minute'
             AND a.estado NOT IN ('completed','cancelled')
             AND a.eliminado_en IS NULL AND a.archivado_en IS NULL
           FOR SHARE OF a, b, p`
            : type === "streak_at_risk"
              ? // Sigue sin ganar el día cuando por fin se crea el aviso.
                `SELECT profile.usuario_id FROM dominio.perfiles_usuario profile
           WHERE profile.usuario_id = $2 AND NOT EXISTS (
             SELECT 1 FROM dominio.dias_racha d WHERE d.usuario_id = profile.usuario_id
               AND d.fecha = timezone(profile.zona_horaria, $8::timestamptz)::date)`
              : "SELECT $2::uuid AS usuario_id";
      const inserted = await connection.query<{ created: number }>(
        `WITH enabled AS (
       SELECT prefs.usuario_id FROM dominio.preferencias_usuario prefs
       JOIN dominio.perfiles_usuario profile ON profile.usuario_id = prefs.usuario_id
       ${localClockJoin(8)}
       WHERE prefs.usuario_id = $2 AND prefs.notificaciones_habilitadas
         AND ${outsideQuietHours}
       FOR SHARE OF prefs, profile
     ), eligible AS (
       ${eligibleSource}
     ), created AS (
       INSERT INTO dominio.notificaciones
         (id, usuario_id, tipo, plan_id, actividad_id, bloque_id, referencia_en, creada_en)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8 FROM enabled JOIN eligible USING (usuario_id)
       ON CONFLICT DO NOTHING
       RETURNING id, usuario_id
     ), queued AS (
       INSERT INTO dominio.envios_push
         (id, usuario_id, dispositivo_id, notificacion_id, traza_id, span_origen_id)
       SELECT gen_random_uuid(), d.usuario_id, d.id, created.id, $9, $10
       FROM created JOIN dominio.dispositivos_push d
         ON d.usuario_id = created.usuario_id
       JOIN dominio.preferencias_usuario prefs ON prefs.usuario_id = d.usuario_id
       WHERE prefs.push_habilitado AND d.actualizado_en >= now() - interval '30 days'
       ON CONFLICT (notificacion_id, dispositivo_id) DO NOTHING
       RETURNING id
     ) SELECT (SELECT count(*)::integer FROM created) AS created,
       (SELECT count(*)::integer FROM queued) AS queued`,
        [
          crypto.randomUUID(),
          row.userId,
          type,
          row.planId,
          row.activityId,
          row.blockId,
          row.referenceAt,
          now,
          trace?.traceId ?? null,
          trace?.spanId ?? null,
        ],
      );
      return inserted.rows[0]?.created ?? 0;
    },
  );
}

export function createNotificationSchedulerRepository(pool: Pool) {
  return {
    async processDue(now: Date = new Date(), limit = 50) {
      const deadline = await pool.query<Candidate>(
        `SELECT ${candidateColumns}, NULL::uuid AS "planId", NULL::uuid AS "blockId",
           a.fecha_limite AS "referenceAt"
         FROM dominio.actividades a
         JOIN dominio.perfiles_usuario profile ON profile.usuario_id = a.usuario_id
         JOIN dominio.preferencias_usuario prefs ON prefs.usuario_id = a.usuario_id
         JOIN dominio.preferencias_avisos notice ON notice.usuario_id = a.usuario_id
         ${localClockJoin(1)}
         WHERE prefs.notificaciones_habilitadas AND ${outsideQuietHours}
           AND a.estado NOT IN ('completed','cancelled')
           AND a.eliminado_en IS NULL AND a.archivado_en IS NULL
           AND a.fecha_limite > $1 AND a.fecha_limite <=
             $1::timestamptz + notice.anticipacion_plazo_minutos * interval '1 minute'
           AND NOT EXISTS (SELECT 1 FROM dominio.notificaciones n
             WHERE n.usuario_id = a.usuario_id AND n.tipo = 'deadline_reminder'
               AND n.actividad_id = a.id AND n.referencia_en = a.fecha_limite)
         ORDER BY a.fecha_limite, a.id LIMIT $2`,
        [now, limit],
      );
      const block = await pool.query<Candidate>(
        `SELECT ${candidateColumns}, p.id AS "planId", b.id AS "blockId",
           b.inicia_en AS "referenceAt"
         FROM dominio.bloques_plan b
         JOIN dominio.planes p ON p.id = b.plan_id AND p.usuario_id = b.usuario_id
         JOIN dominio.actividades a ON a.id = b.actividad_id AND a.usuario_id = b.usuario_id
         JOIN dominio.perfiles_usuario profile ON profile.usuario_id = b.usuario_id
         JOIN dominio.preferencias_usuario prefs ON prefs.usuario_id = b.usuario_id
         JOIN dominio.preferencias_avisos notice ON notice.usuario_id = b.usuario_id
         ${localClockJoin(1)}
         WHERE p.estado = 'active' AND prefs.notificaciones_habilitadas
           AND ${outsideQuietHours}
           AND a.estado NOT IN ('completed','cancelled') AND a.eliminado_en IS NULL
           AND a.archivado_en IS NULL
           AND b.inicia_en > $1 AND b.inicia_en <=
             $1::timestamptz + notice.anticipacion_bloque_minutos * interval '1 minute'
           AND NOT EXISTS (SELECT 1 FROM dominio.notificaciones n
             WHERE n.usuario_id = b.usuario_id AND n.tipo = 'block_reminder'
               AND n.bloque_id = b.id AND n.referencia_en = b.inicia_en)
         ORDER BY b.inicia_en, b.id LIMIT $2`,
        [now, limit],
      );
      const risk = await pool.query<Candidate>(
        `SELECT * FROM (
           SELECT ${candidateColumns}, p.id AS "planId", NULL::uuid AS "blockId",
             NULL::timestamptz AS "referenceAt", 'snapshot'::text AS "riskSource",
             r.nivel_cambio_en AS "levelChangedAt"
           FROM dominio.riesgos_actuales r
           JOIN dominio.planes p ON p.id = r.plan_id AND p.usuario_id = r.usuario_id
           JOIN dominio.revisiones_planificacion revision ON revision.usuario_id = p.usuario_id
           JOIN dominio.actividades a ON a.id = r.actividad_id AND a.usuario_id = r.usuario_id
           JOIN dominio.perfiles_usuario profile ON profile.usuario_id = r.usuario_id
           JOIN dominio.preferencias_usuario prefs ON prefs.usuario_id = r.usuario_id
           JOIN dominio.preferencias_avisos notice ON notice.usuario_id = r.usuario_id
           ${localClockJoin(1)}
           WHERE p.estado = 'active' AND p.riesgo_revision_comprobada = revision.revision
             AND r.revision_origen = revision.revision AND r.nivel = 'high'
             AND prefs.notificaciones_habilitadas AND ${outsideQuietHours}
             AND a.estado NOT IN ('completed','cancelled') AND a.eliminado_en IS NULL
             AND a.archivado_en IS NULL
             AND NOT EXISTS (SELECT 1 FROM dominio.notificaciones n
               WHERE n.usuario_id = r.usuario_id AND n.tipo = 'risk_alert'
                 AND n.actividad_id = r.actividad_id
                 AND n.creada_en > $1::timestamptz -
                   notice.enfriamiento_riesgo_minutos * interval '1 minute'
                 AND n.creada_en >= r.nivel_cambio_en)
           UNION ALL
           SELECT ${candidateColumns}, p.id AS "planId", NULL::uuid AS "blockId",
             NULL::timestamptz AS "referenceAt", 'stored'::text AS "riskSource",
             NULL::timestamptz AS "levelChangedAt"
           FROM dominio.riesgos_plan r
           JOIN dominio.planes p ON p.id = r.plan_id AND p.usuario_id = r.usuario_id
           JOIN dominio.revisiones_planificacion revision ON revision.usuario_id = p.usuario_id
           JOIN dominio.actividades a ON a.id = r.actividad_id AND a.usuario_id = r.usuario_id
           JOIN dominio.perfiles_usuario profile ON profile.usuario_id = r.usuario_id
           JOIN dominio.preferencias_usuario prefs ON prefs.usuario_id = r.usuario_id
           JOIN dominio.preferencias_avisos notice ON notice.usuario_id = r.usuario_id
           ${localClockJoin(1)}
           WHERE p.estado = 'active' AND p.revision_origen = revision.revision
             AND p.riesgo_revision_comprobada IS DISTINCT FROM revision.revision
             AND r.nivel = 'high' AND prefs.notificaciones_habilitadas
             AND ${outsideQuietHours}
             AND a.estado NOT IN ('completed','cancelled') AND a.eliminado_en IS NULL
             AND a.archivado_en IS NULL
             AND NOT EXISTS (SELECT 1 FROM dominio.notificaciones n
               WHERE n.usuario_id = r.usuario_id AND n.tipo = 'risk_alert'
                 AND n.actividad_id = r.actividad_id
                 AND n.creada_en > $1::timestamptz -
                   notice.enfriamiento_riesgo_minutos * interval '1 minute')
         ) candidates ORDER BY "planId", "activityId" LIMIT $2`,
        [now, limit],
      );
      // Racha en peligro: desde las 20:00 locales, si ayer se ganó el día y hoy
      // todavía no. Uno por día.
      const streak = await pool.query<Candidate>(
        `SELECT profile.usuario_id AS "userId", NULL::uuid AS "activityId",
           profile.zona_horaria AS "timeZone",
           prefs.minuto_silencio_inicio AS "quietStartMinute",
           prefs.minuto_silencio_fin AS "quietEndMinute",
           NULL::uuid AS "planId", NULL::uuid AS "blockId",
           (local_day.today::timestamp AT TIME ZONE profile.zona_horaria) AS "referenceAt"
         FROM dominio.perfiles_usuario profile
         JOIN dominio.preferencias_usuario prefs ON prefs.usuario_id = profile.usuario_id
         ${localClockJoin(1)}
         CROSS JOIN LATERAL (
           SELECT timezone(profile.zona_horaria, $1::timestamptz)::date AS today
         ) local_day
         WHERE prefs.notificaciones_habilitadas AND ${outsideQuietHours}
           AND local_clock.local_minute >= ${STREAK_REMINDER_MINUTE}
           AND EXISTS (SELECT 1 FROM dominio.dias_racha d
             WHERE d.usuario_id = profile.usuario_id
               AND d.fecha = local_day.today - 1)
           AND NOT EXISTS (SELECT 1 FROM dominio.dias_racha d
             WHERE d.usuario_id = profile.usuario_id AND d.fecha = local_day.today)
           AND NOT EXISTS (SELECT 1 FROM dominio.notificaciones n
             WHERE n.usuario_id = profile.usuario_id AND n.tipo = 'streak_at_risk'
               AND n.referencia_en = (local_day.today::timestamp AT TIME ZONE profile.zona_horaria))
         ORDER BY profile.usuario_id LIMIT $2`,
        [now, limit],
      );
      let created = 0;
      for (const [type, rows] of [
        ["deadline_reminder", deadline.rows],
        ["block_reminder", block.rows],
        ["risk_alert", risk.rows],
        ["streak_at_risk", streak.rows],
      ] as const) {
        for (const row of rows) {
          try {
            if (isQuietAt(now, row.timeZone, row.quietStartMinute, row.quietEndMinute)) continue;
          } catch {
            continue;
          }
          if (type !== "risk_alert") {
            created += await insertNotice(pool, type, row, now);
            continue;
          }
          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            // Preference and profile updates advance the revision. Lock source rows first.
            await client.query(
              `SELECT 1 FROM dominio.preferencias_usuario
               WHERE usuario_id = $1 FOR SHARE`,
              [row.userId],
            );
            await client.query(
              `SELECT 1 FROM dominio.perfiles_usuario
               WHERE usuario_id = $1 FOR SHARE`,
              [row.userId],
            );
            const revision = await client.query<{ revision: string }>(
              `SELECT revision::text FROM dominio.revisiones_planificacion
               WHERE usuario_id = $1 FOR SHARE`,
              [row.userId],
            );
            const current = await client.query<{ levelChangedAt: Date | null }>(
              row.riskSource === "snapshot"
                ? `SELECT r.nivel_cambio_en AS "levelChangedAt"
                   FROM dominio.riesgos_actuales r
                   JOIN dominio.planes p ON p.usuario_id = r.usuario_id AND p.id = r.plan_id
                   JOIN dominio.actividades a ON a.usuario_id = r.usuario_id AND a.id = r.actividad_id
                   JOIN dominio.preferencias_usuario prefs ON prefs.usuario_id = r.usuario_id
                   WHERE r.usuario_id = $1 AND r.plan_id = $2 AND r.actividad_id = $3
                     AND r.nivel = 'high' AND p.estado = 'active'
                     AND p.riesgo_revision_comprobada = $4::bigint
                     AND r.revision_origen = $4::bigint
                     AND prefs.notificaciones_habilitadas
                     AND a.estado NOT IN ('completed','cancelled')
                     AND a.eliminado_en IS NULL AND a.archivado_en IS NULL
                   FOR UPDATE OF r`
                : `SELECT NULL::timestamptz AS "levelChangedAt"
                   FROM dominio.riesgos_plan r
                   JOIN dominio.planes p ON p.usuario_id = r.usuario_id AND p.id = r.plan_id
                   JOIN dominio.actividades a ON a.usuario_id = r.usuario_id AND a.id = r.actividad_id
                   JOIN dominio.preferencias_usuario prefs ON prefs.usuario_id = r.usuario_id
                   WHERE r.usuario_id = $1 AND r.plan_id = $2 AND r.actividad_id = $3
                     AND r.nivel = 'high' AND p.estado = 'active'
                     AND p.revision_origen = $4::bigint
                     AND p.riesgo_revision_comprobada IS DISTINCT FROM $4::bigint
                     AND prefs.notificaciones_habilitadas
                     AND a.estado NOT IN ('completed','cancelled')
                     AND a.eliminado_en IS NULL AND a.archivado_en IS NULL
                   FOR UPDATE OF r`,
              [row.userId, row.planId, row.activityId, revision.rows[0]?.revision ?? "-1"],
            );
            if (current.rowCount) {
              const recent = await client.query(
                `SELECT 1 FROM dominio.notificaciones n
                 JOIN dominio.preferencias_avisos notice ON notice.usuario_id = n.usuario_id
                 WHERE n.usuario_id = $1 AND n.actividad_id = $2 AND n.tipo = 'risk_alert'
                   AND n.creada_en > $3::timestamptz -
                     notice.enfriamiento_riesgo_minutos * interval '1 minute'
                   AND ($4::timestamptz IS NULL OR n.creada_en >= $4::timestamptz)
                 LIMIT 1`,
                [row.userId, row.activityId, now, current.rows[0]?.levelChangedAt ?? null],
              );
              if (!recent.rowCount) created += await insertNotice(client, type, row, now);
            }
            await client.query("COMMIT");
          } catch (caught) {
            await client.query("ROLLBACK").catch(() => {});
            throw caught;
          } finally {
            client.release();
          }
        }
      }
      return created;
    },
  };
}
export type NotificationSchedulerRepository = ReturnType<
  typeof createNotificationSchedulerRepository
>;
