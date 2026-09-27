import {
  createActivityRepository,
  createAvailabilityRepository,
  createCalendarEventRepository,
  createPlanRepository,
  createPreferenceRepository,
  createProfileRepository,
  createTimeEntryRepository,
} from "@notesia/db";
import {
  computePlanning,
  localDayBounds,
  remainingWorkMinutes,
  shiftLocalDate,
} from "@notesia/domain";
import type { Pool } from "pg";

/** Días que cubre el plan automático, empezando hoy. */
export const AUTO_PLAN_DAYS = 7;

type Candidate = { userId: string; today: string };

/**
 * Plan automático: cuando cambian las tareas, las horas ocupadas, el horario de
 * estudio o las preferencias (la revisión de planificación), o empieza un día
 * nuevo, rehace el plan de hoy a 7 días con el planificador determinístico y lo
 * aplica sin pedir confirmación ni avisar "Plan aplicado". Lo que no alcance lo
 * avisa la reevaluación de riesgo, como siempre.
 */
export function createAutoPlanner(pool: Pool) {
  const activities = createActivityRepository(pool);
  const availability = createAvailabilityRepository(pool);
  const events = createCalendarEventRepository(pool);
  const plans = createPlanRepository(pool);
  const preferences = createPreferenceRepository(pool);
  const profiles = createProfileRepository(pool);
  const timeEntries = createTimeEntryRepository(pool);

  const remember = (userId: string, revision: string, today: string) =>
    pool.query(
      `INSERT INTO dominio.planificacion_automatica (usuario_id, revision, fecha, intentado_en)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (usuario_id) DO UPDATE SET revision = EXCLUDED.revision,
         fecha = EXCLUDED.fecha, intentado_en = EXCLUDED.intentado_en`,
      [userId, revision, today],
    );

  return {
    /** `onlyUserId` limita la búsqueda a un estudiante (para pruebas). */
    async processOne(now: Date = new Date(), onlyUserId: string | null = null) {
      const candidates = await pool.query<Candidate>(
        `SELECT profile.usuario_id AS "userId", local_day.today::text AS today
         FROM dominio.perfiles_usuario profile
         CROSS JOIN LATERAL (
           SELECT timezone(profile.zona_horaria, $1::timestamptz)::date AS today
         ) local_day
         LEFT JOIN dominio.revisiones_planificacion revision
           ON revision.usuario_id = profile.usuario_id
         LEFT JOIN dominio.planificacion_automatica auto
           ON auto.usuario_id = profile.usuario_id
         WHERE profile.configuracion_inicial_en IS NOT NULL
           AND ($2::uuid IS NULL OR profile.usuario_id = $2)
           AND EXISTS (SELECT 1 FROM dominio.reglas_disponibilidad rule
             WHERE rule.usuario_id = profile.usuario_id AND rule.archivado_en IS NULL)
           AND (auto.usuario_id IS NULL
             OR auto.revision IS DISTINCT FROM coalesce(revision.revision, 0)
             OR auto.fecha <> local_day.today)
         ORDER BY auto.intentado_en NULLS FIRST, profile.usuario_id LIMIT 1`,
        [now, onlyUserId],
      );
      const candidate = candidates.rows[0];
      if (!candidate) return { kind: "empty" as const };
      const { userId, today } = candidate;

      const revision = await plans.getRevision(userId);
      const [profile, prefs, active] = await Promise.all([
        profiles.get(userId),
        preferences.get(userId),
        plans.getActive(userId),
      ]);
      if (!profile || !prefs) {
        await remember(userId, revision, today);
        return { kind: "skipped" as const };
      }
      const from = today;
      const through = shiftLocalDate(today, AUTO_PLAN_DAYS);
      const startsAt = localDayBounds(from, profile.timeZone).startsAt;
      const endsAt = localDayBounds(through, profile.timeZone).startsAt;
      const [rules, exceptions, busy, pending, logged] = await Promise.all([
        availability.listRules(userId),
        availability.listExceptions(userId, shiftLocalDate(from, -1), through),
        events.listInRange(userId, { startsAt: new Date(startsAt), endsAt: new Date(endsAt) }),
        activities.listForPlanning(userId),
        timeEntries.sumByActivity(userId),
      ]);
      if (pending.length > 500) {
        await remember(userId, revision, today);
        return { kind: "skipped" as const };
      }
      const loggedSeconds = new Map(logged.map((row) => [row.activityId, Number(row.seconds)]));
      const limits = {
        minSessionMinutes: prefs.minSessionMinutes,
        maxSessionMinutes: prefs.maxSessionMinutes,
        maxDailyMinutes: prefs.maxDailyMinutes,
      };
      const computed = computePlanning({
        source: {
          calendar: {
            from,
            through,
            timeZone: profile.timeZone,
            rules: rules.filter((rule) => !rule.archivedAt),
            exceptions,
            blocked: busy.map((event) => ({
              startsAt: event.startsAt.toISOString(),
              endsAt: event.endsAt.toISOString(),
            })),
          },
          activities: pending
            .map((activity) => ({
              id: activity.id,
              remainingMinutes: remainingWorkMinutes({
                estimatedMinutes: activity.estimatedMinutes ?? 0,
                progressPercent: activity.progressPercent,
                loggedSeconds: loggedSeconds.get(activity.id) ?? 0,
              }),
              priority: activity.priority,
              startAfterAt: activity.startAfterAt?.toISOString() ?? null,
              deadlineAt: activity.deadlineAt?.toISOString() ?? null,
              createdAt: activity.createdAt.toISOString(),
            }))
            .filter((activity) => activity.remainingMinutes > 0),
          startsAt,
          endsAt,
        },
        lockedBlocks: [],
        now: now.toISOString(),
        limits,
      });
      if (computed.kind !== "computed") {
        await remember(userId, revision, today);
        return { kind: "skipped" as const };
      }
      const draft = await plans.createDraft(userId, {
        id: crypto.randomUUID(),
        from,
        through,
        ...limits,
        algorithmVersion: computed.algorithmVersion,
        sourceRevision: revision,
        basePlanId: active?.id ?? null,
        blocks: computed.blocks.map((block) => ({
          id: crypto.randomUUID(),
          activityId: block.activityId,
          startsAt: new Date(block.startsAt),
          endsAt: new Date(block.endsAt),
          isLocked: false,
        })),
        ...computed.summary,
      });
      if (!draft) throw new Error("Automatic plan draft was not persisted");
      const applied = await plans.apply(userId, draft.id, draft.version, { notify: false });
      if (applied.kind !== "applied") {
        // Los datos cambiaron mientras se calculaba: se intenta de nuevo en la próxima vuelta.
        await plans.reject(userId, draft.id, draft.version);
        return { kind: "retry" as const };
      }
      await remember(userId, revision, today);
      return { kind: "planned" as const };
    },
  };
}
