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

type Candidate = { userId: string; planId: string };
type LockedPlan = {
  id: string;
  from: string;
  through: string;
  sourceRevision: string;
  checkedRevision: string | null;
  checkAt: Date | null;
  minSessionMinutes: number;
  maxSessionMinutes: number;
  maxDailyMinutes: number;
};

export function createRiskReassessment(pool: Pool) {
  const activities = createActivityRepository(pool);
  const availability = createAvailabilityRepository(pool);
  const events = createCalendarEventRepository(pool);
  const plans = createPlanRepository(pool);
  const preferences = createPreferenceRepository(pool);
  const profiles = createProfileRepository(pool);
  const timeEntries = createTimeEntryRepository(pool);

  return {
    async processOne(now: Date = new Date()) {
      const candidates = await pool.query<Candidate>(
        `SELECT p.usuario_id AS "userId", p.id AS "planId"
         FROM dominio.planes p
         JOIN dominio.revisiones_planificacion revision ON revision.usuario_id = p.usuario_id
         WHERE p.estado = 'active' AND (
           p.riesgo_revision_comprobada IS DISTINCT FROM revision.revision
           OR p.riesgo_comprobar_en IS NULL OR p.riesgo_comprobar_en <= $1)
         ORDER BY p.riesgo_comprobar_en NULLS FIRST, p.id LIMIT 1`,
        [now],
      );
      const candidate = candidates.rows[0];
      if (!candidate) return { kind: "empty" as const };
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const revisionRow = await client.query<{ revision: string }>(
          `SELECT revision::text FROM dominio.revisiones_planificacion
           WHERE usuario_id = $1 FOR SHARE`,
          [candidate.userId],
        );
        const revision = revisionRow.rows[0]?.revision;
        const planRow = await client.query<LockedPlan>(
          `SELECT id, fecha_desde::text AS "from", fecha_hasta::text AS "through",
             revision_origen::text AS "sourceRevision",
             riesgo_revision_comprobada::text AS "checkedRevision",
             riesgo_comprobar_en AS "checkAt",
             sesion_minima AS "minSessionMinutes", sesion_maxima AS "maxSessionMinutes",
             maximo_diario AS "maxDailyMinutes"
           FROM dominio.planes WHERE usuario_id = $1 AND id = $2 AND estado = 'active'
           FOR UPDATE`,
          [candidate.userId, candidate.planId],
        );
        const plan = planRow.rows[0];
        if (
          !revision ||
          !plan ||
          (plan.checkedRevision === revision && plan.checkAt && plan.checkAt > now)
        ) {
          await client.query("COMMIT");
          return { kind: "skipped" as const };
        }
        const [profile, prefs, storedPlan] = await Promise.all([
          profiles.get(candidate.userId),
          preferences.get(candidate.userId),
          plans.get(candidate.userId, plan.id),
        ]);
        if (!profile || !prefs || !storedPlan) throw new Error("Planning source is unavailable");
        const startsAt = localDayBounds(plan.from, profile.timeZone).startsAt;
        const endsAt = localDayBounds(plan.through, profile.timeZone).startsAt;
        const [rules, exceptions, fixedEvents, pending, logged] = await Promise.all([
          availability.listRules(candidate.userId),
          availability.listExceptions(
            candidate.userId,
            shiftLocalDate(plan.from, -1),
            plan.through,
          ),
          events.listInRange(candidate.userId, {
            startsAt: new Date(startsAt),
            endsAt: new Date(endsAt),
          }),
          activities.listForPlanning(candidate.userId),
          timeEntries.sumByActivity(candidate.userId),
        ]);
        const loggedSeconds = new Map(logged.map((row) => [row.activityId, Number(row.seconds)]));
        const source = {
          calendar: {
            from: plan.from,
            through: plan.through,
            timeZone: profile.timeZone,
            rules: rules.filter((rule) => !rule.archivedAt),
            exceptions,
            blocked: fixedEvents.map((event) => ({
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
        };
        const limits = {
          minSessionMinutes: prefs.minSessionMinutes,
          maxSessionMinutes: prefs.maxSessionMinutes,
          maxDailyMinutes: prefs.maxDailyMinutes,
        };
        const preserveLocks =
          plan.sourceRevision === revision &&
          plan.minSessionMinutes === limits.minSessionMinutes &&
          plan.maxSessionMinutes === limits.maxSessionMinutes &&
          plan.maxDailyMinutes === limits.maxDailyMinutes;
        const lockedBlocks = preserveLocks
          ? storedPlan.blocks
              .filter((block) => block.isLocked)
              .map((block) => ({
                activityId: block.activityId,
                startsAt: block.startsAt.toISOString(),
                endsAt: block.endsAt.toISOString(),
              }))
          : [];
        const assessment =
          pending.length <= 500
            ? computePlanning({ source, lockedBlocks, now: now.toISOString(), limits })
            : { kind: "too_many_activities" as const };
        const risk = assessment.kind === "computed" ? assessment.summary.risk : [];
        for (const item of risk) {
          await client.query(
            `INSERT INTO dominio.riesgos_actuales
             (usuario_id, actividad_id, plan_id, revision_origen, version_algoritmo,
              minutos_restantes, minutos_capacidad, minutos_margen, nivel, razones,
              nivel_cambio_en, calculado_en)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT (usuario_id, actividad_id) DO UPDATE SET
               plan_id = EXCLUDED.plan_id,
               revision_origen = EXCLUDED.revision_origen,
               version_algoritmo = EXCLUDED.version_algoritmo,
               minutos_restantes = EXCLUDED.minutos_restantes,
               minutos_capacidad = EXCLUDED.minutos_capacidad,
               minutos_margen = EXCLUDED.minutos_margen,
               nivel_cambio_en = CASE
                 WHEN dominio.riesgos_actuales.nivel <> EXCLUDED.nivel
                   THEN EXCLUDED.calculado_en
                 ELSE dominio.riesgos_actuales.nivel_cambio_en END,
               nivel = EXCLUDED.nivel, razones = EXCLUDED.razones,
               calculado_en = EXCLUDED.calculado_en`,
            [
              candidate.userId,
              item.activityId,
              plan.id,
              revision,
              assessment.kind === "computed"
                ? assessment.algorithmVersion
                : storedPlan.algorithmVersion,
              item.remainingMinutes,
              item.capacityMinutes,
              item.marginMinutes,
              item.level,
              item.reasons,
              storedPlan.risk.find((saved) => saved.activityId === item.activityId)?.level ===
              item.level
                ? (storedPlan.appliedAt ?? storedPlan.createdAt)
                : now,
              now,
            ],
          );
        }
        await client.query(
          `DELETE FROM dominio.riesgos_actuales
           WHERE usuario_id = $1 AND actividad_id <> ALL($2::uuid[])`,
          [candidate.userId, risk.map((item) => item.activityId)],
        );
        await client.query(
          `UPDATE dominio.planes SET riesgo_revision_comprobada = $3,
             riesgo_comprobar_en = $4 WHERE usuario_id = $1 AND id = $2`,
          [candidate.userId, plan.id, revision, new Date(now.getTime() + 15 * 60000)],
        );
        await client.query("COMMIT");
        return {
          kind: assessment.kind === "computed" ? ("assessed" as const) : ("skipped" as const),
        };
      } catch (caught) {
        await client.query("ROLLBACK").catch(() => {});
        throw caught;
      } finally {
        client.release();
      }
    },
  };
}
