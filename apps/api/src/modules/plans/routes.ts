import {
  activePlanSchema,
  dateRangeSchema,
  type Problem,
  planActionSchema,
  planBlockEditSchema,
  planHistoryCursorSchema,
  planHistoryPageSchema,
  planPreviewSchema,
  planSchema,
  riskAssessmentPageSchema,
} from "@notesia/contracts";
import type {
  ActivityRepository,
  AvailabilityRepository,
  CalendarEventRepository,
  PlanRepository,
  PreferenceRepository,
  ProfileRepository,
  TimeEntryRepository,
} from "@notesia/db";
import {
  calculateAvailability,
  computePlanning,
  localDayBounds,
  type PlannedBlock,
  type PlanningActivity,
  remainingWorkMinutes,
  shiftLocalDate,
  summarizePlan,
  validatePlanBlocks,
} from "@notesia/domain";
import type { Hono } from "hono";
import { z } from "zod";

type Dependencies = {
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
  plans: PlanRepository;
  activities: ActivityRepository;
  availability: AvailabilityRepository;
  events: CalendarEventRepository;
  profiles: ProfileRepository;
  preferences: PreferenceRepository;
  timeEntries: TimeEntryRepository;
  now?(): Date;
};
type Plan = NonNullable<Awaited<ReturnType<PlanRepository["get"]>>>;

function error(status: 401 | 404 | 409 | 422, code: string, title: string): Response {
  const body: Problem = {
    type: `https://notesia.local/problems/${code.toLowerCase().replaceAll("_", "-")}`,
    title,
    status,
    code,
    requestId: crypto.randomUUID(),
  };
  return Response.json(body, { status, headers: { "Content-Type": "application/problem+json" } });
}
function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return Promise.resolve(null);
  return request.json().catch(() => null);
}
function toPlan(row: Plan) {
  return planSchema.parse({
    id: row.id,
    status: row.status,
    version: row.version,
    algorithmVersion: row.algorithmVersion,
    sourceRevision: row.sourceRevision,
    from: row.from,
    through: row.through,
    minSessionMinutes: row.minSessionMinutes,
    maxSessionMinutes: row.maxSessionMinutes,
    maxDailyMinutes: row.maxDailyMinutes,
    blocks: row.blocks.map((block) => ({
      ...block,
      startsAt: block.startsAt.toISOString(),
      endsAt: block.endsAt.toISOString(),
    })),
    unscheduled: row.unscheduled,
    risk: row.risk,
    createdAt: row.createdAt.toISOString(),
    appliedAt: row.appliedAt?.toISOString() ?? null,
  });
}
function toSummary(row: Omit<Plan, "blocks" | "unscheduled" | "risk">) {
  return planSchema.omit({ blocks: true, unscheduled: true, risk: true }).parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    appliedAt: row.appliedAt?.toISOString() ?? null,
  });
}
function isUniqueViolation(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const caught = value as { code?: unknown; cause?: unknown };
  return caught.code === "23505" || isUniqueViolation(caught.cause);
}
function activityInputs(
  rows: Awaited<ReturnType<ActivityRepository["listForPlanning"]>>,
  loggedSeconds: Map<string, number>,
): PlanningActivity[] {
  return rows
    .map((row) => ({
      id: row.id,
      remainingMinutes: remainingWorkMinutes({
        estimatedMinutes: row.estimatedMinutes ?? 0,
        progressPercent: row.progressPercent,
        loggedSeconds: loggedSeconds.get(row.id) ?? 0,
      }),
      priority: row.priority,
      startAfterAt: row.startAfterAt?.toISOString() ?? null,
      deadlineAt: row.deadlineAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }))
    .filter((row) => row.remainingMinutes > 0);
}
async function context(dependencies: Dependencies, userId: string, from: string, through: string) {
  const profile = await dependencies.profiles.get(userId);
  if (!profile) return null;
  const startsAt = localDayBounds(from, profile.timeZone).startsAt;
  const endsAt = localDayBounds(through, profile.timeZone).startsAt;
  const [rules, exceptions, events, activities, logged] = await Promise.all([
    dependencies.availability.listRules(userId),
    dependencies.availability.listExceptions(userId, shiftLocalDate(from, -1), through),
    dependencies.events.listInRange(userId, {
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
    }),
    dependencies.activities.listForPlanning(userId),
    dependencies.timeEntries.sumByActivity(userId),
  ]);
  const calendar = {
    from,
    through,
    timeZone: profile.timeZone,
    rules: rules.filter((rule) => !rule.archivedAt),
    exceptions,
    blocked: events.map((event) => ({
      startsAt: event.startsAt.toISOString(),
      endsAt: event.endsAt.toISOString(),
    })),
  };
  return {
    calendar,
    activities: activityInputs(
      activities,
      new Map(logged.map((row) => [row.activityId, Number(row.seconds)])),
    ),
    tooManyActivities: activities.length > 500,
    startsAt,
    endsAt,
  };
}
function rangeValid(from: string, through: string) {
  return through > from && through <= shiftLocalDate(from, 31);
}

function planningError(kind: Exclude<ReturnType<typeof computePlanning>["kind"], "computed">) {
  switch (kind) {
    case "horizon_ended":
      return error(422, "VALIDATION_FAILED", "El horizonte del plan ya terminó.");
    case "locked_outside_horizon":
      return error(
        409,
        "SCHEDULE_CONFLICT",
        "Amplía el horizonte para conservar todos los bloques bloqueados.",
      );
    case "locked_invalid":
      return error(
        409,
        "SCHEDULE_CONFLICT",
        "Un bloque bloqueado ya no cabe en la disponibilidad.",
      );
    case "invalid_plan":
      return error(409, "SCHEDULE_CONFLICT", "No se pudo construir un plan válido.");
  }
}
function activeLockedBlocks(active: Plan | null): PlannedBlock[] {
  return (active?.blocks ?? [])
    .filter((block) => block.isLocked)
    .map((block) => ({
      activityId: block.activityId,
      startsAt: block.startsAt.toISOString(),
      endsAt: block.endsAt.toISOString(),
    }));
}

export function registerPlanRoutes(app: Hono, dependencies: Dependencies) {
  app.post("/v1/plans/preview", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const parsed = planPreviewSchema.safeParse(await readBody(c.req.raw));
    if (!parsed.success || !rangeValid(parsed.data.from, parsed.data.through))
      return error(422, "VALIDATION_FAILED", "Horizonte o preferencias de plan inválidos.");
    const preferences = await dependencies.preferences.get(session.user.id);
    if (!preferences) return error(404, "NOT_FOUND", "Preferencias no disponibles.");
    const input = {
      ...parsed.data,
      minSessionMinutes: parsed.data.minSessionMinutes ?? preferences.minSessionMinutes,
      maxSessionMinutes: parsed.data.maxSessionMinutes ?? preferences.maxSessionMinutes,
      maxDailyMinutes: parsed.data.maxDailyMinutes ?? preferences.maxDailyMinutes,
    };
    if (
      input.maxSessionMinutes < input.minSessionMinutes ||
      input.maxDailyMinutes < input.minSessionMinutes
    )
      return error(422, "VALIDATION_FAILED", "Límites de sesión incompatibles.");
    const existing = await dependencies.plans.get(session.user.id, input.id);
    if (existing) {
      if (
        existing.status === "draft" &&
        existing.from === input.from &&
        existing.through === input.through &&
        existing.minSessionMinutes === input.minSessionMinutes &&
        existing.maxSessionMinutes === input.maxSessionMinutes &&
        existing.maxDailyMinutes === input.maxDailyMinutes
      )
        return c.json(toPlan(existing));
      return error(409, "VERSION_CONFLICT", "Ese identificador ya pertenece a otro plan.");
    }
    const revision = await dependencies.plans.getRevision(session.user.id);
    const [active, source] = await Promise.all([
      dependencies.plans.getActive(session.user.id),
      context(dependencies, session.user.id, input.from, input.through),
    ]);
    if (!source) return error(404, "NOT_FOUND", "Perfil no disponible.");
    if (source.tooManyActivities)
      return error(422, "VALIDATION_FAILED", "Hay más de 500 actividades pendientes.");
    const now = (dependencies.now?.() ?? new Date()).toISOString();
    const computed = computePlanning({
      source,
      lockedBlocks: activeLockedBlocks(active),
      now,
      limits: input,
    });
    if (computed.kind !== "computed") return planningError(computed.kind);
    if (revision !== (await dependencies.plans.getRevision(session.user.id)))
      return error(409, "VERSION_CONFLICT", "Los datos cambiaron durante la vista previa.");
    try {
      const saved = await dependencies.plans.createDraft(session.user.id, {
        ...input,
        algorithmVersion: computed.algorithmVersion,
        sourceRevision: revision,
        basePlanId: active?.id ?? null,
        blocks: computed.blocks.map((block) => ({
          id: crypto.randomUUID(),
          activityId: block.activityId,
          startsAt: new Date(block.startsAt),
          endsAt: new Date(block.endsAt),
          isLocked: computed.lockedBlocks.includes(block),
        })),
        ...computed.summary,
      });
      if (!saved) throw new Error("Draft was not persisted");
      return c.json(toPlan(saved), 201);
    } catch (caught) {
      if (isUniqueViolation(caught)) return error(409, "VERSION_CONFLICT", "Ese plan ya existe.");
      throw caught;
    }
  });

  app.get("/v1/risk-assessments", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const range = dateRangeSchema.safeParse({
      from: c.req.query("from"),
      through: c.req.query("through"),
    });
    if (!range.success || !rangeValid(range.data.from, range.data.through))
      return error(422, "VALIDATION_FAILED", "Horizonte de riesgo inválido.");
    const preferences = await dependencies.preferences.get(session.user.id);
    if (!preferences) return error(404, "NOT_FOUND", "Preferencias no disponibles.");
    const revision = await dependencies.plans.getRevision(session.user.id);
    const [active, source] = await Promise.all([
      dependencies.plans.getActive(session.user.id),
      context(dependencies, session.user.id, range.data.from, range.data.through),
    ]);
    if (!source) return error(404, "NOT_FOUND", "Perfil no disponible.");
    if (source.tooManyActivities)
      return error(422, "VALIDATION_FAILED", "Hay más de 500 actividades pendientes.");
    const now = (dependencies.now?.() ?? new Date()).toISOString();
    const currentPlan =
      active?.sourceRevision === revision &&
      active.from === range.data.from &&
      active.through === range.data.through &&
      active.minSessionMinutes === preferences.minSessionMinutes &&
      active.maxSessionMinutes === preferences.maxSessionMinutes &&
      active.maxDailyMinutes === preferences.maxDailyMinutes
        ? active
        : null;
    const computed = computePlanning({
      source,
      lockedBlocks: activeLockedBlocks(currentPlan),
      now,
      limits: preferences,
    });
    if (computed.kind !== "computed") return planningError(computed.kind);
    if (revision !== (await dependencies.plans.getRevision(session.user.id)))
      return error(409, "VERSION_CONFLICT", "Los datos cambiaron durante el cálculo de riesgo.");
    return c.json(
      riskAssessmentPageSchema.parse({
        ...range.data,
        timeZone: source.calendar.timeZone,
        computedAt: now,
        algorithmVersion: computed.algorithmVersion,
        sourceRevision: revision,
        ...computed.summary,
      }),
      200,
      { "Cache-Control": "no-store" },
    );
  });

  app.get("/v1/plans/active", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const plan = await dependencies.plans.getActive(session.user.id);
    if (!plan) return error(404, "NOT_FOUND", "Todavía no hay un plan activo.");
    const currentSourceRevision = await dependencies.plans.getRevision(session.user.id);
    return c.json(
      activePlanSchema.parse({
        ...toPlan(plan),
        currentSourceRevision,
        isStale: plan.sourceRevision !== currentSourceRevision,
      }),
      200,
      { "Cache-Control": "no-store" },
    );
  });

  app.get("/v1/plans/history", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const raw = c.req.query("cursor");
    let cursor: { createdAt: string; id: string } | null = null;
    if (raw !== undefined) {
      try {
        if (raw.length > 256) throw new Error("Cursor too long");
        const decoded = planHistoryCursorSchema.parse(
          JSON.parse(Buffer.from(raw, "base64url").toString()),
        );
        cursor = { createdAt: decoded.createdAt, id: decoded.id };
      } catch {
        return error(422, "VALIDATION_FAILED", "Cursor inválido.");
      }
    }
    const rows = await dependencies.plans.history(session.user.id, cursor);
    const page = rows.slice(0, 20);
    const last = page.at(-1);
    return c.json(
      planHistoryPageSchema.parse({
        items: page.map(toSummary),
        nextCursor:
          rows.length > 20 && last
            ? Buffer.from(
                JSON.stringify({ createdAt: last.cursorCreatedAt, id: last.id }),
              ).toString("base64url")
            : null,
      }),
    );
  });

  app.get("/v1/plans/:id", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const id = c.req.param("id");
    if (!z.uuid().safeParse(id).success) return error(404, "NOT_FOUND", "Plan no encontrado.");
    const plan = await dependencies.plans.get(session.user.id, id);
    return plan ? c.json(toPlan(plan)) : error(404, "NOT_FOUND", "Plan no encontrado.");
  });

  app.patch("/v1/plans/:id/blocks/:blockId", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const id = c.req.param("id");
    const blockId = c.req.param("blockId");
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(blockId).success)
      return error(404, "NOT_FOUND", "Bloque no encontrado.");
    const parsed = planBlockEditSchema.safeParse(await readBody(c.req.raw));
    if (!parsed.success) return error(422, "VALIDATION_FAILED", "Bloque inválido.");
    const plan = await dependencies.plans.get(session.user.id, id);
    if (!plan) return error(404, "NOT_FOUND", "Plan no encontrado.");
    const previous = plan.blocks.find((block) => block.id === blockId);
    if (!previous) return error(404, "NOT_FOUND", "Bloque no encontrado.");
    if (plan.status !== "draft" || plan.version !== parsed.data.version)
      return error(409, "VERSION_CONFLICT", "El plan cambió. Actualízalo antes de editar.");
    if (
      previous.isLocked &&
      (previous.startsAt.toISOString() !== parsed.data.startsAt ||
        previous.endsAt.toISOString() !== parsed.data.endsAt)
    ) {
      return error(409, "SCHEDULE_CONFLICT", "Desbloquea el bloque antes de moverlo.");
    }
    if (parsed.data.startsAt < (dependencies.now?.() ?? new Date()).toISOString())
      return error(409, "SCHEDULE_CONFLICT", "El bloque ya quedó en el pasado.");
    const revision = await dependencies.plans.getRevision(session.user.id);
    if (revision !== plan.sourceRevision)
      return error(409, "VERSION_CONFLICT", "Los datos cambiaron. Genera otra vista previa.");
    const source = await context(dependencies, session.user.id, plan.from, plan.through);
    if (!source || source.tooManyActivities)
      return error(409, "VERSION_CONFLICT", "Los datos cambiaron.");
    const free = calculateAvailability(source.calendar);
    const blocks = plan.blocks.map(
      (block): PlannedBlock =>
        block.id === blockId
          ? {
              activityId: block.activityId,
              startsAt: parsed.data.startsAt,
              endsAt: parsed.data.endsAt,
            }
          : {
              activityId: block.activityId,
              startsAt: block.startsAt.toISOString(),
              endsAt: block.endsAt.toISOString(),
            },
    );
    if (
      !validatePlanBlocks({
        blocks,
        freeSlots: free.slots,
        activities: source.activities,
        timeZone: source.calendar.timeZone,
        minSessionMinutes: plan.minSessionMinutes,
        maxSessionMinutes: plan.maxSessionMinutes,
        maxDailyMinutes: plan.maxDailyMinutes,
      })
    ) {
      return error(
        409,
        "SCHEDULE_CONFLICT",
        "El bloque no cabe en la disponibilidad o excede el trabajo.",
      );
    }
    const summary = summarizePlan({
      blocks,
      freeSlots: free.slots,
      activities: source.activities,
      now: (dependencies.now?.() ?? new Date()).toISOString(),
      minSessionMinutes: plan.minSessionMinutes,
      maxSessionMinutes: plan.maxSessionMinutes,
    });
    const saved = await dependencies.plans.changeBlock(
      session.user.id,
      id,
      blockId,
      parsed.data.version,
      {
        startsAt: new Date(parsed.data.startsAt),
        endsAt: new Date(parsed.data.endsAt),
        isLocked: parsed.data.isLocked,
      },
      summary,
    );
    return saved ? c.json(toPlan(saved)) : error(409, "VERSION_CONFLICT", "El plan cambió.");
  });

  app.delete("/v1/plans/:id/blocks/:blockId", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const id = c.req.param("id");
    const blockId = c.req.param("blockId");
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(blockId).success)
      return error(404, "NOT_FOUND", "Bloque no encontrado.");
    const parsed = planActionSchema.safeParse(await readBody(c.req.raw));
    if (!parsed.success) return error(422, "VALIDATION_FAILED", "Versión inválida.");
    const plan = await dependencies.plans.get(session.user.id, id);
    if (!plan) return error(404, "NOT_FOUND", "Plan no encontrado.");
    const previous = plan.blocks.find((block) => block.id === blockId);
    if (!previous) return error(404, "NOT_FOUND", "Bloque no encontrado.");
    if (plan.status !== "draft" || plan.version !== parsed.data.version)
      return error(409, "VERSION_CONFLICT", "El plan cambió. Actualízalo antes de editar.");
    if (previous.isLocked)
      return error(409, "SCHEDULE_CONFLICT", "Desbloquea el bloque antes de quitarlo.");
    const revision = await dependencies.plans.getRevision(session.user.id);
    if (revision !== plan.sourceRevision)
      return error(409, "VERSION_CONFLICT", "Los datos cambiaron. Genera otra vista previa.");
    const source = await context(dependencies, session.user.id, plan.from, plan.through);
    if (!source || source.tooManyActivities)
      return error(409, "VERSION_CONFLICT", "Los datos cambiaron.");
    const free = calculateAvailability(source.calendar);
    const blocks = plan.blocks
      .filter((block) => block.id !== blockId)
      .map(
        (block): PlannedBlock => ({
          activityId: block.activityId,
          startsAt: block.startsAt.toISOString(),
          endsAt: block.endsAt.toISOString(),
        }),
      );
    const summary = summarizePlan({
      blocks,
      freeSlots: free.slots,
      activities: source.activities,
      now: (dependencies.now?.() ?? new Date()).toISOString(),
      minSessionMinutes: plan.minSessionMinutes,
      maxSessionMinutes: plan.maxSessionMinutes,
    });
    const saved = await dependencies.plans.changeBlock(
      session.user.id,
      id,
      blockId,
      parsed.data.version,
      null,
      summary,
    );
    return saved ? c.json(toPlan(saved)) : error(409, "VERSION_CONFLICT", "El plan cambió.");
  });

  for (const action of ["apply", "reject"] as const) {
    app.post(`/v1/plans/:id/${action}`, async (c) => {
      const session = await dependencies.getSession(c.req.raw.headers);
      if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
      const id = c.req.param("id");
      if (!z.uuid().safeParse(id).success) return error(404, "NOT_FOUND", "Plan no encontrado.");
      const parsed = planActionSchema.safeParse(await readBody(c.req.raw));
      if (!parsed.success) return error(422, "VALIDATION_FAILED", "Versión inválida.");
      if (action === "apply") {
        const draft = await dependencies.plans.get(session.user.id, id);
        if (!draft) return error(404, "NOT_FOUND", "Plan no encontrado.");
        if (
          draft.status === "draft" &&
          draft.version === parsed.data.version &&
          draft.blocks.some((block) => block.startsAt < (dependencies.now?.() ?? new Date()))
        ) {
          return error(
            409,
            "SCHEDULE_CONFLICT",
            "El plan contiene bloques que ya quedaron en el pasado.",
          );
        }
        const result = await dependencies.plans.apply(session.user.id, id, parsed.data.version);
        if (result.kind === "not_found") return error(404, "NOT_FOUND", "Plan no encontrado.");
        if (result.kind === "source_conflict")
          return error(409, "VERSION_CONFLICT", "Los datos cambiaron. Genera otra vista previa.");
        if (result.kind === "version_conflict")
          return error(409, "VERSION_CONFLICT", "El plan cambió. Actualízalo antes de aplicar.");
        if (!result.plan) throw new Error("Applied plan was not found");
        return c.json(toPlan(result.plan));
      }
      const rejected = await dependencies.plans.reject(session.user.id, id, parsed.data.version);
      if (rejected) {
        const plan = await dependencies.plans.get(session.user.id, id);
        if (!plan) throw new Error("Rejected plan was not found");
        return c.json(toPlan(plan));
      }
      const plan = await dependencies.plans.get(session.user.id, id);
      return plan
        ? error(409, "VERSION_CONFLICT", "El plan cambió. Actualízalo antes de continuar.")
        : error(404, "NOT_FOUND", "Plan no encontrado.");
    });
  }
}
