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
  };
}

export type AiContextRepository = ReturnType<typeof createAiContextRepository>;
