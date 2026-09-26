import type { Pool } from "pg";

export function createAiContextRepository(pool: Pool) {
  return {
    async risk(userId: string, planId: string, activityId: string) {
      const result = await pool.query<{
        sourceCurrent: boolean;
        level: "low" | "medium" | "high";
        remainingMinutes: number;
        availableMinutes: number;
        deadlineHours: number;
      }>(
        `SELECT p.revision_origen = revision.revision AS "sourceCurrent",
           r.nivel AS level, r.minutos_restantes AS "remainingMinutes",
           r.minutos_capacidad AS "availableMinutes",
           coalesce(least(100000, greatest(0, ceil(extract(epoch from
             (a.fecha_limite - now())) / 3600))), 0)::integer AS "deadlineHours"
         FROM dominio.planes p
         JOIN dominio.revisiones_planificacion revision ON revision.usuario_id = p.usuario_id
         JOIN dominio.riesgos_plan r ON r.usuario_id = p.usuario_id AND r.plan_id = p.id
         JOIN dominio.actividades a ON a.id = r.actividad_id AND a.usuario_id = r.usuario_id
         WHERE p.usuario_id = $1 AND p.id = $2 AND r.actividad_id = $3`,
        [userId, planId, activityId],
      );
      const row = result.rows[0];
      if (!row) return { kind: "not_found" as const };
      if (!row.sourceCurrent) return { kind: "stale" as const };
      const { sourceCurrent: _sourceCurrent, ...facts } = row;
      return { kind: "found" as const, facts };
    },
    async replan(userId: string, planId: string) {
      const result = await pool.query<{
        movedBlocks: number;
        addedBlocks: number;
        removedBlocks: number;
        unscheduledMinutes: number;
      }>(
        `WITH selected AS (
           SELECT id, plan_base_id FROM dominio.planes
           WHERE usuario_id = $1 AND id = $2 AND plan_base_id IS NOT NULL
         ), draft AS (
           SELECT b.actividad_id, b.inicia_en, b.termina_en,
             row_number() OVER (PARTITION BY b.actividad_id ORDER BY b.inicia_en, b.id) AS ordinal
           FROM dominio.bloques_plan b JOIN selected p ON p.id = b.plan_id
           WHERE b.usuario_id = $1
         ), previous AS (
           SELECT b.actividad_id, b.inicia_en, b.termina_en,
             row_number() OVER (PARTITION BY b.actividad_id ORDER BY b.inicia_en, b.id) AS ordinal
           FROM dominio.bloques_plan b JOIN selected p ON p.plan_base_id = b.plan_id
           WHERE b.usuario_id = $1
         )
         SELECT
           (SELECT count(*)::integer FROM draft d FULL JOIN previous p
             ON d.actividad_id = p.actividad_id AND d.ordinal = p.ordinal
             WHERE d.actividad_id IS NOT NULL AND p.actividad_id IS NOT NULL
               AND (d.inicia_en, d.termina_en) IS DISTINCT FROM (p.inicia_en, p.termina_en)) AS "movedBlocks",
           (SELECT count(*)::integer FROM draft d FULL JOIN previous p
             ON d.actividad_id = p.actividad_id AND d.ordinal = p.ordinal
             WHERE p.actividad_id IS NULL) AS "addedBlocks",
           (SELECT count(*)::integer FROM draft d FULL JOIN previous p
             ON d.actividad_id = p.actividad_id AND d.ordinal = p.ordinal
             WHERE d.actividad_id IS NULL) AS "removedBlocks",
           (SELECT coalesce(sum(u.minutos), 0)::integer FROM dominio.trabajo_no_asignado u
             WHERE u.usuario_id = $1 AND u.plan_id = selected.id) AS "unscheduledMinutes"
         FROM selected`,
        [userId, planId],
      );
      return result.rows[0] ?? null;
    },
    /**
     * Actividades visibles para el asistente: solo del usuario, sin borradas ni
     * archivadas, como mucho 30. `text` filtra por título; `from`/`to`, por plazo.
     */
    async assistantActivities(
      userId: string,
      filter: { text?: string | null; open?: boolean; from?: Date | null; to?: Date | null },
    ) {
      const result = await pool.query<{
        id: string;
        title: string;
        kind: string;
        priority: string;
        status: string;
        startAfterAt: Date | null;
        deadlineAt: Date | null;
        estimatedMinutes: number | null;
        progressPercent: number;
      }>(
        `SELECT id, titulo AS title, tipo AS kind, prioridad AS priority, estado AS status,
           inicio_minimo AS "startAfterAt", fecha_limite AS "deadlineAt",
           minutos_estimados AS "estimatedMinutes", porcentaje_progreso AS "progressPercent"
         FROM dominio.actividades
         WHERE usuario_id = $1 AND eliminado_en IS NULL AND archivado_en IS NULL
           AND ($2::text IS NULL OR titulo ILIKE '%' || replace(replace($2, '%', ''), '_', '') || '%')
           AND (NOT $3::boolean OR estado NOT IN ('completed', 'cancelled'))
           AND ($4::timestamptz IS NULL OR fecha_limite >= $4)
           AND ($5::timestamptz IS NULL OR fecha_limite < $5)
         ORDER BY fecha_limite NULLS LAST, orden DESC
         LIMIT 30`,
        [
          userId,
          filter.text?.trim() || null,
          filter.open ?? true,
          filter.from ?? null,
          filter.to ?? null,
        ],
      );
      return result.rows;
    },
    /** Zona horaria del perfil, para que el asistente entienda "mañana a las 10". */
    async assistantTimeZone(userId: string) {
      const result = await pool.query<{ timeZone: string | null }>(
        `SELECT zona_horaria AS "timeZone" FROM dominio.perfiles_usuario WHERE usuario_id = $1`,
        [userId],
      );
      return result.rows[0]?.timeZone ?? null;
    },
    /** Eventos del calendario del usuario que se cruzan con el rango, como mucho 30. */
    async assistantEvents(userId: string, from: Date, to: Date) {
      const result = await pool.query<{
        id: string;
        title: string;
        kind: string;
        startsAt: Date;
        endsAt: Date;
      }>(
        `SELECT id, titulo AS title, tipo AS kind, inicia_en AS "startsAt", termina_en AS "endsAt"
         FROM dominio.eventos_calendario
         WHERE usuario_id = $1 AND archivado_en IS NULL AND inicia_en < $3 AND termina_en > $2
         ORDER BY inicia_en
         LIMIT 30`,
        [userId, from, to],
      );
      return result.rows;
    },
  };
}

export type AiContextRepository = ReturnType<typeof createAiContextRepository>;
