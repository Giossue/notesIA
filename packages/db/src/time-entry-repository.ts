import type { Pool } from "pg";

type Entry = {
  id: string;
  activityId: string;
  source: "timer" | "manual";
  startsAt: Date;
  endsAt: Date | null;
  durationSeconds: number | null;
  lastStopMutationId: string | null;
  version: number;
  createdAt: Date;
  cursorCreatedAt: string;
};
const columns = `id, actividad_id AS "activityId", origen AS source,
  inicia_en AS "startsAt", termina_en AS "endsAt",
  duracion_segundos AS "durationSeconds", ultima_mutacion_cierre AS "lastStopMutationId",
  version, creado_en AS "createdAt",
  to_char(creado_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    AS "cursorCreatedAt"`;

export function createTimeEntryRepository(pool: Pool) {
  return {
    async get(userId: string, id: string) {
      const result = await pool.query<Entry>(
        `select ${columns} from dominio.registros_tiempo where usuario_id = $1 and id = $2`,
        [userId, id],
      );
      return result.rows[0] ?? null;
    },
    async getOpen(userId: string) {
      const result = await pool.query<Entry>(
        `select ${columns} from dominio.registros_tiempo
         where usuario_id = $1 and termina_en is null limit 1`,
        [userId],
      );
      return result.rows[0] ?? null;
    },
    async list(userId: string, cursor: { createdAt: string; id: string } | null) {
      const result = await pool.query<Entry>(
        `select ${columns} from dominio.registros_tiempo where usuario_id = $1
         and ($2::timestamptz is null or (creado_en, id) < ($2::timestamptz, $3::uuid))
         order by creado_en desc, id desc limit 21`,
        [userId, cursor?.createdAt ?? null, cursor?.id ?? null],
      );
      return result.rows;
    },
    async start(userId: string, id: string, activityId: string, now: Date) {
      const result = await pool.query<Entry>(
        `insert into dominio.registros_tiempo
         (id, usuario_id, actividad_id, origen, inicia_en) values ($1,$2,$3,'timer',$4)
         on conflict do nothing returning ${columns}`,
        [id, userId, activityId, now],
      );
      if (result.rows[0]) return { kind: "created" as const, row: result.rows[0] };
      const existing = await this.get(userId, id);
      if (existing && existing.activityId === activityId && existing.source === "timer")
        return { kind: "replayed" as const, row: existing };
      return { kind: "conflict" as const };
    },
    async stop(userId: string, id: string, version: number, mutationId: string, now: Date) {
      const result = await pool.query<Entry>(
        `update dominio.registros_tiempo
         set termina_en = $5, duracion_segundos = greatest(1,
           floor(extract(epoch from ($5::timestamptz - inicia_en)))::integer),
           ultima_mutacion_cierre = $4, version = version + 1
         where usuario_id = $1 and id = $2 and version = $3 and termina_en is null
           and inicia_en < $5
         returning ${columns}`,
        [userId, id, version, mutationId, now],
      );
      if (result.rows[0]) return { kind: "stopped" as const, row: result.rows[0] };
      const existing = await this.get(userId, id);
      if (!existing) return { kind: "not_found" as const };
      if (existing.lastStopMutationId === mutationId && existing.version === version + 1)
        return { kind: "replayed" as const, row: existing };
      return { kind: "conflict" as const };
    },
    async manual(userId: string, id: string, activityId: string, minutes: number, endsAt: Date) {
      const startsAt = new Date(endsAt.getTime() - minutes * 60000);
      const result = await pool.query<Entry>(
        `insert into dominio.registros_tiempo
         (id, usuario_id, actividad_id, origen, inicia_en, termina_en, duracion_segundos)
         values ($1,$2,$3,'manual',$4,$5,$6)
         on conflict do nothing returning ${columns}`,
        [id, userId, activityId, startsAt, endsAt, minutes * 60],
      );
      if (result.rows[0]) return { kind: "created" as const, row: result.rows[0] };
      const existing = await this.get(userId, id);
      if (!existing) return { kind: "overlap" as const };
      if (
        existing.source === "manual" &&
        existing.activityId === activityId &&
        existing.durationSeconds === minutes * 60 &&
        existing.endsAt?.getTime() === endsAt.getTime()
      )
        return { kind: "replayed" as const, row: existing };
      return { kind: "conflict" as const };
    },
    async sumByActivity(userId: string) {
      const result = await pool.query<{ activityId: string; seconds: string }>(
        `select actividad_id AS "activityId", sum(duracion_segundos)::text AS seconds
         from dominio.registros_tiempo where usuario_id = $1 and termina_en is not null
         group by actividad_id`,
        [userId],
      );
      return result.rows;
    },
    async statistics(userId: string, from: Date, through: Date, timeZone: string) {
      const result = await pool.query<{ weekStart: string; seconds: string }>(
        `select date_trunc('week', termina_en at time zone $4)::date::text AS "weekStart",
           sum(duracion_segundos)::text AS seconds
         from dominio.registros_tiempo
         where usuario_id = $1 and termina_en >= $2 and termina_en < $3
         group by 1 order by 1`,
        [userId, from, through, timeZone],
      );
      return result.rows;
    },
    async comparisonStatistics(userId: string, from: Date, through: Date) {
      const result = await pool.query<{
        activityId: string;
        title: string;
        estimatedMinutes: number | null;
        actualSeconds: string;
      }>(
        `select a.id AS "activityId", a.titulo AS title,
           a.minutos_estimados AS "estimatedMinutes",
           sum(r.duracion_segundos)::text AS "actualSeconds"
         from dominio.registros_tiempo r
         join dominio.actividades a on a.usuario_id = r.usuario_id and a.id = r.actividad_id
         where r.usuario_id = $1 and r.termina_en >= $2 and r.termina_en < $3
         group by a.id, a.titulo, a.minutos_estimados
         order by sum(r.duracion_segundos) desc, a.id`,
        [userId, from, through],
      );
      return result.rows;
    },
    async activityStatistics(
      userId: string,
      from: Date,
      through: Date,
      timeZone: string,
      now: Date,
    ) {
      const result = await pool.query<{
        weekStart: string;
        completedActivities: number;
        dueActivities: number;
        overdueActivities: number;
        onTimeActivities: number;
      }>(
        `WITH weekly AS (
           SELECT date_trunc('week', a.completado_en AT TIME ZONE $4)::date::text AS "weekStart",
             1 AS completed, 0 AS due, 0 AS overdue, 0 AS on_time
           FROM dominio.actividades a
           WHERE a.usuario_id = $1 AND a.eliminado_en IS NULL
             AND a.estado = 'completed' AND a.completado_en >= $2
             AND a.completado_en < $3
           UNION ALL
           SELECT date_trunc('week', a.fecha_limite AT TIME ZONE $4)::date::text,
             0, 1,
             CASE WHEN a.completado_en IS NOT NULL AND a.completado_en <= a.fecha_limite
               THEN 0 ELSE 1 END,
             CASE WHEN a.completado_en IS NOT NULL AND a.completado_en <= a.fecha_limite
               THEN 1 ELSE 0 END
           FROM dominio.actividades a
           WHERE a.usuario_id = $1 AND a.eliminado_en IS NULL
             AND a.estado <> 'cancelled' AND a.fecha_limite >= $2
             AND a.fecha_limite < $3 AND a.fecha_limite <= $5
         )
         SELECT "weekStart", sum(completed)::integer AS "completedActivities",
           sum(due)::integer AS "dueActivities",
           sum(overdue)::integer AS "overdueActivities",
           sum(on_time)::integer AS "onTimeActivities"
         FROM weekly GROUP BY "weekStart" ORDER BY "weekStart"`,
        [userId, from, through, timeZone, now],
      );
      return result.rows;
    },
  };
}
export type TimeEntryRepository = ReturnType<typeof createTimeEntryRepository>;
