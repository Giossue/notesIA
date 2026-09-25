import {
  type ActivityCreate,
  type ActivityUpdate,
  activityCreateSchema,
  activityCursorSchema,
  activityDeleteSchema,
  activityHistoryCursorSchema,
  activityHistoryPageSchema,
  activityHistorySchema,
  activityPageSchema,
  activityProgressSchema,
  activitySchema,
  activityStatusSchema,
  activitySummarySchema,
  activityTransitionSchema,
  activityUpdateSchema,
  type Problem,
  subjectVersionSchema,
} from "@notesia/contracts";
import type { ActivityRepository, ProfileRepository } from "@notesia/db";
import {
  calendarRangeForDate,
  localDayBounds,
  shiftLocalDate,
  todayInTimeZone,
  utcToLocalDateTime,
} from "@notesia/domain";
import type { Hono } from "hono";
import { z } from "zod";

const STREAK_LOOKBACK_DAYS = 120;

type Session = { user: { id: string } };
type Dependencies = {
  getSession(headers: Headers): Promise<Session | null>;
  activities: ActivityRepository;
  profiles: ProfileRepository;
};
type ActivityRow = NonNullable<Awaited<ReturnType<ActivityRepository["get"]>>>;

function error(status: 401 | 404 | 409 | 422, code: string, title: string): Response {
  const body: Problem = {
    type: `https://notesia.local/problems/${code.toLowerCase().replaceAll("_", "-")}`,
    title,
    status,
    code,
    requestId: crypto.randomUUID(),
  };
  return Response.json(body, {
    status,
    headers: { "Content-Type": "application/problem+json" },
  });
}

function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return Promise.resolve(null);
  return request.json().catch(() => null);
}

function toFields(input: ActivityCreate | ActivityUpdate) {
  return {
    subjectId: input.subjectId,
    kind: input.kind,
    title: input.title,
    description: input.description,
    priority: input.priority,
    startAfterAt: input.startAfterAt ? new Date(input.startAfterAt) : null,
    deadlineAt: input.deadlineAt ? new Date(input.deadlineAt) : null,
    estimatedMinutes: input.estimatedMinutes,
  };
}

function toActivity(row: ActivityRow) {
  return activitySchema.parse({
    id: row.id,
    seriesId: row.seriesId,
    occursOn: row.occursOn,
    subjectId: row.subjectId,
    kind: row.kind,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    startAfterAt: row.startAfterAt?.toISOString() ?? null,
    deadlineAt: row.deadlineAt?.toISOString() ?? null,
    estimatedMinutes: row.estimatedMinutes,
    progressPercent: row.progressPercent,
    completedAt: row.completedAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function hasForeignKeyViolation(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const errorValue = value as { code?: unknown; cause?: unknown };
  return errorValue.code === "23503" || hasForeignKeyViolation(errorValue.cause);
}

function decodeCursor(raw: string, key: "sortOrder" | "id") {
  if (raw.length > 256) throw new Error("Invalid cursor");
  const value: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  return key === "sortOrder"
    ? BigInt(activityCursorSchema.parse(value).sortOrder)
    : BigInt(activityHistoryCursorSchema.parse(value).id);
}

function encodeCursor(value: bigint, key: "sortOrder" | "id") {
  return Buffer.from(JSON.stringify({ [key]: value.toString() })).toString("base64url");
}

export function registerActivityRoutes(app: Hono, dependencies: Dependencies) {
  app.get("/v1/activities", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");

    const archivedQuery = c.req.query("archived");
    if (archivedQuery !== undefined && archivedQuery !== "true" && archivedQuery !== "false")
      return error(422, "VALIDATION_FAILED", "Filtro de actividades inválido.");
    const statusQuery = c.req.query("status");
    const status = statusQuery ? activityStatusSchema.safeParse(statusQuery) : null;
    if (status && !status.success)
      return error(422, "VALIDATION_FAILED", "Estado de actividad inválido.");
    const seriesId = c.req.query("seriesId");
    if (seriesId !== undefined && !z.uuid().safeParse(seriesId).success)
      return error(422, "VALIDATION_FAILED", "Serie de actividad inválida.");
    const dueOn = c.req.query("dueOn");
    if (dueOn && !z.iso.date().safeParse(dueOn).success)
      return error(422, "VALIDATION_FAILED", "Fecha de agenda inválida.");
    const dueFrom = c.req.query("dueFrom");
    const dueThrough = c.req.query("dueThrough");
    if (
      (dueFrom !== undefined || dueThrough !== undefined) &&
      (!dueFrom ||
        !dueThrough ||
        dueOn !== undefined ||
        !z.iso.date().safeParse(dueFrom).success ||
        !z.iso.date().safeParse(dueThrough).success ||
        dueThrough <= dueFrom ||
        dueThrough > shiftLocalDate(dueFrom, 31))
    )
      return error(422, "VALIDATION_FAILED", "Rango de agenda inválido; máximo 31 días.");
    if ((dueOn || dueFrom) && archivedQuery === "true")
      return error(422, "VALIDATION_FAILED", "La agenda solo muestra actividades activas.");

    const rawCursor = c.req.query("cursor");
    let cursor: bigint | null = null;
    if (rawCursor !== undefined) {
      try {
        cursor = decodeCursor(rawCursor, "sortOrder");
      } catch {
        return error(422, "INVALID_CURSOR", "Cursor inválido.");
      }
    }

    let dayBounds: { startsAt: Date; endsAt: Date } | undefined;
    const startDay = dueOn ?? dueFrom;
    const endDay = dueOn ? shiftLocalDate(dueOn, 1) : dueThrough;
    if (startDay && endDay) {
      const profile = await dependencies.profiles.get(session.user.id);
      if (!profile) return error(404, "PROFILE_NOT_FOUND", "Perfil no disponible.");
      const bounds = {
        startsAt: localDayBounds(startDay, profile.timeZone).startsAt,
        endsAt: localDayBounds(endDay, profile.timeZone).startsAt,
      };
      dayBounds = { startsAt: new Date(bounds.startsAt), endsAt: new Date(bounds.endsAt) };
    }

    const rows = await dependencies.activities.list(session.user.id, {
      archived: archivedQuery === "true",
      cursor,
      status: status?.success ? status.data : undefined,
      seriesId,
      dayBounds,
    });
    const pageRows = rows.slice(0, 20);
    const last = pageRows.at(-1);
    return c.json(
      activityPageSchema.parse({
        items: pageRows.map(toActivity),
        nextCursor: rows.length > 20 && last ? encodeCursor(last.sortOrder, "sortOrder") : null,
      }),
    );
  });

  app.get("/v1/activities/summary", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const profile = await dependencies.profiles.get(session.user.id);
    if (!profile) return error(404, "PROFILE_NOT_FOUND", "Perfil no disponible.");

    const zone = profile.timeZone;
    const now = new Date();
    const day = todayInTimeZone(now.toISOString(), zone);
    const startOf = (date: string) => new Date(localDayBounds(date, zone).startsAt);
    const localDay = (instant: Date) =>
      utcToLocalDateTime(instant.toISOString(), zone).slice(0, 10);
    const week = calendarRangeForDate(day, "week");
    const weekDays = Array.from({ length: 7 }, (_, index) => shiftLocalDate(week.from, index));
    const streakFrom = shiftLocalDate(day, -STREAK_LOOKBACK_DAYS);

    const [counts, weekRows, subjectRows, completions] = await Promise.all([
      dependencies.activities.summary(
        session.user.id,
        { startsAt: startOf(day), endsAt: startOf(shiftLocalDate(day, 1)) },
        now,
      ),
      dependencies.activities.completionsAndDeadlines(session.user.id, {
        startsAt: startOf(week.from),
        endsAt: startOf(week.through),
      }),
      dependencies.activities.subjectProgress(session.user.id, 3),
      dependencies.activities.completionInstantsSince(session.user.id, startOf(streakFrom)),
    ]);

    const days = new Map(weekDays.map((date) => [date, { date, completed: 0, due: 0 }]));
    let due = 0;
    let completedDue = 0;
    for (const row of weekRows) {
      if (row.completedAt) {
        const bucket = days.get(localDay(row.completedAt));
        if (bucket) bucket.completed += 1;
      }
      if (row.deadlineAt && row.status !== "cancelled") {
        const bucket = days.get(localDay(row.deadlineAt));
        if (bucket) {
          bucket.due += 1;
          due += 1;
          if (row.status === "completed") completedDue += 1;
        }
      }
    }

    const completedDays = new Set(completions.map(localDay));
    let cursor = completedDays.has(day) ? day : shiftLocalDate(day, -1);
    let streakDays = 0;
    while (completedDays.has(cursor) && streakDays < STREAK_LOOKBACK_DAYS) {
      streakDays += 1;
      cursor = shiftLocalDate(cursor, -1);
    }

    return c.json(
      activitySummarySchema.parse({
        day,
        ...counts,
        week: { ...week, due, completedDue, days: [...days.values()] },
        subjects: subjectRows,
        streakDays,
      }),
    );
  });

  app.get("/v1/activities/:id/history", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const id = c.req.param("id");
    if (!z.uuid().safeParse(id).success)
      return error(404, "ACTIVITY_NOT_FOUND", "Actividad no encontrada.");
    const activity = await dependencies.activities.get(session.user.id, id);
    if (!activity) return error(404, "ACTIVITY_NOT_FOUND", "Actividad no encontrada.");

    const rawCursor = c.req.query("cursor");
    let cursor: bigint | null = null;
    if (rawCursor !== undefined) {
      try {
        cursor = decodeCursor(rawCursor, "id");
      } catch {
        return error(422, "INVALID_CURSOR", "Cursor inválido.");
      }
    }
    const rows = await dependencies.activities.history(session.user.id, id, cursor);
    const pageRows = rows.slice(0, 20);
    const last = pageRows.at(-1);
    return c.json(
      activityHistoryPageSchema.parse({
        items: pageRows.map((row) =>
          activityHistorySchema.parse({
            id: row.id.toString(),
            mutationId: row.mutationId,
            eventType: row.eventType,
            beforeStatus: row.beforeStatus,
            afterStatus: row.afterStatus,
            beforeProgress: row.beforeProgress,
            afterProgress: row.afterProgress,
            createdAt: row.createdAt.toISOString(),
          }),
        ),
        nextCursor: rows.length > 20 && last ? encodeCursor(last.id, "id") : null,
      }),
    );
  });

  app.get("/v1/activities/:id", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const id = c.req.param("id");
    if (!z.uuid().safeParse(id).success)
      return error(404, "ACTIVITY_NOT_FOUND", "Actividad no encontrada.");
    const row = await dependencies.activities.get(session.user.id, id);
    return row
      ? c.json(toActivity(row))
      : error(404, "ACTIVITY_NOT_FOUND", "Actividad no encontrada.");
  });

  app.post("/v1/activities", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const parsed = activityCreateSchema.safeParse(await readBody(c.req.raw));
    if (!parsed.success)
      return error(422, "VALIDATION_FAILED", "Revisa los datos de la actividad.");
    try {
      const result = await dependencies.activities.create(
        session.user.id,
        parsed.data.id,
        toFields(parsed.data),
      );
      if (!result) return error(409, "ACTIVITY_CONFLICT", "No se pudo guardar la actividad.");
      return c.json(toActivity(result.row), result.created ? 201 : 200);
    } catch (caught) {
      if (hasForeignKeyViolation(caught))
        return error(422, "INVALID_SUBJECT", "Elige una materia de tu cuenta.");
      throw caught;
    }
  });

  app.patch("/v1/activities/:id", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const id = c.req.param("id");
    if (!z.uuid().safeParse(id).success)
      return error(404, "ACTIVITY_NOT_FOUND", "Actividad no encontrada.");
    const parsed = activityUpdateSchema.safeParse(await readBody(c.req.raw));
    if (!parsed.success)
      return error(422, "VALIDATION_FAILED", "Revisa los datos de la actividad.");
    try {
      const row = await dependencies.activities.update(session.user.id, id, {
        ...toFields(parsed.data),
        version: parsed.data.version,
      });
      if (row) return c.json(toActivity(row));
    } catch (caught) {
      if (hasForeignKeyViolation(caught))
        return error(422, "INVALID_SUBJECT", "Elige una materia de tu cuenta.");
      throw caught;
    }
    const existing = await dependencies.activities.get(session.user.id, id);
    return existing
      ? error(409, "VERSION_CONFLICT", "La actividad cambió. Actualízala antes de guardar.")
      : error(404, "ACTIVITY_NOT_FOUND", "Actividad no encontrada.");
  });

  app.delete("/v1/activities/:id", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const id = c.req.param("id");
    if (!z.uuid().safeParse(id).success)
      return error(404, "ACTIVITY_NOT_FOUND", "Actividad no encontrada.");
    const parsed = activityDeleteSchema.safeParse(await readBody(c.req.raw));
    if (!parsed.success) return error(422, "VALIDATION_FAILED", "Eliminación inválida.");
    const result = await dependencies.activities.softDelete(session.user.id, id, parsed.data);
    if (result.kind === "not_found")
      return error(404, "ACTIVITY_NOT_FOUND", "Actividad no encontrada.");
    if (result.kind === "conflict")
      return error(409, "VERSION_CONFLICT", "La actividad cambió. Actualízala antes de eliminar.");
    return new Response(null, { status: 204 });
  });

  for (const archived of [true, false]) {
    app.post(`/v1/activities/:id/${archived ? "archive" : "restore"}`, async (c) => {
      const session = await dependencies.getSession(c.req.raw.headers);
      if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
      const id = c.req.param("id");
      if (!z.uuid().safeParse(id).success)
        return error(404, "ACTIVITY_NOT_FOUND", "Actividad no encontrada.");
      const parsed = subjectVersionSchema.safeParse(await readBody(c.req.raw));
      if (!parsed.success) return error(422, "VALIDATION_FAILED", "Versión inválida.");
      const row = await dependencies.activities.setArchived(
        session.user.id,
        id,
        parsed.data.version,
        archived,
      );
      if (row) return c.json(toActivity(row));
      const existing = await dependencies.activities.get(session.user.id, id);
      return existing
        ? error(409, "VERSION_CONFLICT", "La actividad cambió. Actualízala antes de continuar.")
        : error(404, "ACTIVITY_NOT_FOUND", "Actividad no encontrada.");
    });
  }

  for (const eventType of ["completed", "reopened", "cancelled"] as const) {
    const path =
      eventType === "completed" ? "complete" : eventType === "cancelled" ? "cancel" : "reopen";
    app.post(`/v1/activities/:id/${path}`, async (c) => {
      const session = await dependencies.getSession(c.req.raw.headers);
      if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
      const id = c.req.param("id");
      if (!z.uuid().safeParse(id).success)
        return error(404, "ACTIVITY_NOT_FOUND", "Actividad no encontrada.");
      const parsed = activityTransitionSchema.safeParse(await readBody(c.req.raw));
      if (!parsed.success) return error(422, "VALIDATION_FAILED", "Datos de transición inválidos.");
      const result = await dependencies.activities.transition(session.user.id, id, {
        ...parsed.data,
        eventType,
      });
      if (result.kind === "not_found")
        return error(404, "ACTIVITY_NOT_FOUND", "Actividad no encontrada.");
      if (result.kind === "conflict")
        return error(
          409,
          "VERSION_CONFLICT",
          "La actividad cambió. Actualízala antes de continuar.",
        );
      return c.json(toActivity(result.row));
    });
  }

  app.patch("/v1/activities/:id/progress", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const id = c.req.param("id");
    if (!z.uuid().safeParse(id).success)
      return error(404, "ACTIVITY_NOT_FOUND", "Actividad no encontrada.");
    const parsed = activityProgressSchema.safeParse(await readBody(c.req.raw));
    if (!parsed.success) return error(422, "VALIDATION_FAILED", "Progreso inválido.");
    const result = await dependencies.activities.setProgress(session.user.id, id, parsed.data);
    if (result.kind === "not_found")
      return error(404, "ACTIVITY_NOT_FOUND", "Actividad no encontrada.");
    if (result.kind === "conflict")
      return error(409, "VERSION_CONFLICT", "La actividad cambió. Actualízala antes de continuar.");
    return c.json(toActivity(result.row));
  });
}
