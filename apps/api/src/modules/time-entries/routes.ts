import {
  activeTimeEntrySchema,
  dateRangeSchema,
  type Problem,
  timeEntryCursorSchema,
  timeEntryManualSchema,
  timeEntryPageSchema,
  timeEntrySchema,
  timeEntryStartSchema,
  timeEntryStopSchema,
  timeStatisticsSchema,
} from "@notesia/contracts";
import type { ActivityRepository, ProfileRepository, TimeEntryRepository } from "@notesia/db";
import { localDayBounds, shiftLocalDate } from "@notesia/domain";
import type { Hono } from "hono";
import { z } from "zod";

type Dependencies = {
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
  timeEntries: TimeEntryRepository;
  activities: ActivityRepository;
  profiles: ProfileRepository;
  now?(): Date;
};
type Entry = NonNullable<Awaited<ReturnType<TimeEntryRepository["get"]>>>;

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
function toEntry(row: Entry) {
  return timeEntrySchema.parse({
    id: row.id,
    activityId: row.activityId,
    source: row.source,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    durationSeconds: row.durationSeconds,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
  });
}
function cursor(raw: string) {
  if (raw.length > 256) throw new Error("Invalid cursor");
  const parsed = timeEntryCursorSchema.parse(JSON.parse(Buffer.from(raw, "base64url").toString()));
  return { createdAt: parsed.createdAt, id: parsed.id };
}

export function registerTimeEntryRoutes(app: Hono, dependencies: Dependencies) {
  app.get("/v1/time-entries", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const raw = c.req.query("cursor");
    let position: { createdAt: string; id: string } | null = null;
    if (raw !== undefined) {
      try {
        position = cursor(raw);
      } catch {
        return error(422, "VALIDATION_FAILED", "Cursor inválido.");
      }
    }
    const rows = await dependencies.timeEntries.list(session.user.id, position);
    const page = rows.slice(0, 20);
    const last = page.at(-1);
    return c.json(
      timeEntryPageSchema.parse({
        items: page.map(toEntry),
        nextCursor:
          rows.length > 20 && last
            ? Buffer.from(
                JSON.stringify({ createdAt: last.cursorCreatedAt, id: last.id }),
              ).toString("base64url")
            : null,
      }),
    );
  });

  app.get("/v1/time-entries/active", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const row = await dependencies.timeEntries.getOpen(session.user.id);
    return c.json(activeTimeEntrySchema.parse({ item: row ? toEntry(row) : null }));
  });

  app.post("/v1/time-entries/start", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const parsed = timeEntryStartSchema.safeParse(await readBody(c.req.raw));
    if (!parsed.success) return error(422, "VALIDATION_FAILED", "Sesión inválida.");
    const activity = await dependencies.activities.get(session.user.id, parsed.data.activityId);
    if (!activity || activity.archivedAt || ["completed", "cancelled"].includes(activity.status))
      return error(404, "NOT_FOUND", "Actividad no disponible.");
    const result = await dependencies.timeEntries.start(
      session.user.id,
      parsed.data.id,
      parsed.data.activityId,
      dependencies.now?.() ?? new Date(),
    );
    if (result.kind === "conflict")
      return error(
        409,
        "SCHEDULE_CONFLICT",
        "Ya existe una sesión abierta o el identificador está en uso.",
      );
    return c.json(toEntry(result.row), result.kind === "created" ? 201 : 200);
  });

  app.post("/v1/time-entries/:id/stop", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const id = c.req.param("id");
    if (!z.uuid().safeParse(id).success) return error(404, "NOT_FOUND", "Sesión no encontrada.");
    const parsed = timeEntryStopSchema.safeParse(await readBody(c.req.raw));
    if (!parsed.success) return error(422, "VALIDATION_FAILED", "Versión inválida.");
    const result = await dependencies.timeEntries.stop(
      session.user.id,
      id,
      parsed.data.version,
      parsed.data.mutationId,
      dependencies.now?.() ?? new Date(),
    );
    if (result.kind === "not_found") return error(404, "NOT_FOUND", "Sesión no encontrada.");
    if (result.kind === "conflict") return error(409, "VERSION_CONFLICT", "La sesión cambió.");
    return c.json(toEntry(result.row));
  });

  app.post("/v1/time-entries/manual", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const parsed = timeEntryManualSchema.safeParse(await readBody(c.req.raw));
    if (
      !parsed.success ||
      Date.parse(parsed.data.endsAt) > (dependencies.now?.() ?? new Date()).getTime()
    )
      return error(422, "VALIDATION_FAILED", "Tiempo manual inválido.");
    const activity = await dependencies.activities.get(session.user.id, parsed.data.activityId);
    if (!activity || activity.archivedAt || ["completed", "cancelled"].includes(activity.status))
      return error(404, "NOT_FOUND", "Actividad no disponible.");
    const result = await dependencies.timeEntries.manual(
      session.user.id,
      parsed.data.id,
      parsed.data.activityId,
      parsed.data.minutes,
      new Date(parsed.data.endsAt),
    );
    if (result.kind === "overlap")
      return error(409, "SCHEDULE_CONFLICT", "Ese periodo se solapa con otro registro de trabajo.");
    if (result.kind === "conflict")
      return error(409, "VERSION_CONFLICT", "Ese registro ya existe con otros datos.");
    return c.json(toEntry(result.row), result.kind === "created" ? 201 : 200);
  });

  app.get("/v1/time-entries/statistics", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const parsed = dateRangeSchema.safeParse(c.req.query());
    if (
      !parsed.success ||
      parsed.data.through <= parsed.data.from ||
      parsed.data.through > shiftLocalDate(parsed.data.from, 31)
    )
      return error(422, "VALIDATION_FAILED", "Rango inválido; máximo 31 días.");
    const profile = await dependencies.profiles.get(session.user.id);
    if (!profile) return error(404, "NOT_FOUND", "Perfil no disponible.");
    const { from, through } = parsed.data;
    const start = localDayBounds(from, profile.timeZone).startsAt;
    const end = localDayBounds(through, profile.timeZone).startsAt;
    const now = dependencies.now?.() ?? new Date();
    const [rows, activityRows, comparisonRows] = await Promise.all([
      dependencies.timeEntries.statistics(
        session.user.id,
        new Date(start),
        new Date(end),
        profile.timeZone,
      ),
      dependencies.timeEntries.activityStatistics(
        session.user.id,
        new Date(start),
        new Date(end),
        profile.timeZone,
        now,
      ),
      dependencies.timeEntries.comparisonStatistics(
        session.user.id,
        new Date(start),
        new Date(end),
      ),
    ]);
    const weeks = new Map<string, number>();
    const activityWeeks = new Map(activityRows.map((row) => [row.weekStart, row]));
    let totalSeconds = 0;
    for (const row of rows) {
      const seconds = Number(row.seconds);
      totalSeconds += seconds;
      weeks.set(row.weekStart, (weeks.get(row.weekStart) ?? 0) + seconds);
    }
    return c.json(
      timeStatisticsSchema.parse({
        from,
        through,
        timeZone: profile.timeZone,
        totalSeconds,
        weeks: [...new Set([...weeks.keys(), ...activityWeeks.keys()])].sort().map((weekStart) => {
          const activity = activityWeeks.get(weekStart);
          const dueActivities = activity?.dueActivities ?? 0;
          const onTimeActivities = activity?.onTimeActivities ?? 0;
          return {
            weekStart,
            seconds: weeks.get(weekStart) ?? 0,
            completedActivities: activity?.completedActivities ?? 0,
            dueActivities,
            overdueActivities: activity?.overdueActivities ?? 0,
            onTimeActivities,
            onTimePercent:
              dueActivities > 0 ? Math.round((100 * onTimeActivities) / dueActivities) : null,
          };
        }),
        activities: comparisonRows.map((row) => ({
          activityId: row.activityId,
          title: row.title,
          estimatedMinutes: row.estimatedMinutes,
          actualSeconds: Number(row.actualSeconds),
        })),
      }),
    );
  });
}
