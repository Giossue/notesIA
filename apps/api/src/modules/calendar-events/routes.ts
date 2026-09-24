import {
  type CalendarEventCreate,
  type CalendarEventUpdate,
  calendarEventCreateSchema,
  calendarEventCursorSchema,
  calendarEventDayCursorSchema,
  calendarEventPageSchema,
  calendarEventSchema,
  calendarEventUpdateSchema,
  calendarEventVersionSchema,
  type Problem,
} from "@notesia/contracts";
import type { CalendarEventRepository, ProfileRepository } from "@notesia/db";
import { localDayBounds, shiftLocalDate } from "@notesia/domain";
import type { Hono } from "hono";
import { z } from "zod";

type Session = { user: { id: string } };
type Dependencies = {
  getSession(headers: Headers): Promise<Session | null>;
  events: CalendarEventRepository;
  profiles: ProfileRepository;
};
type EventRow = NonNullable<Awaited<ReturnType<CalendarEventRepository["get"]>>>;

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

function toFields(input: CalendarEventCreate | CalendarEventUpdate) {
  return {
    subjectId: input.subjectId,
    kind: input.kind,
    title: input.title,
    description: input.description,
    startsAt: new Date(input.startsAt),
    endsAt: new Date(input.endsAt),
    timeZone: input.timeZone,
  };
}

function toEvent(row: EventRow) {
  return calendarEventSchema.parse({
    id: row.id,
    subjectId: row.subjectId,
    kind: row.kind,
    title: row.title,
    description: row.description,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    timeZone: row.timeZone,
    isLocked: row.isLocked,
    source: row.source,
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

function decodeCursor(raw: string, onDay: boolean) {
  if (raw.length > 256) throw new Error("Invalid cursor");
  const value: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  if (onDay) {
    const parsed = calendarEventDayCursorSchema.parse(value);
    return { startsAt: new Date(parsed.startsAt), id: parsed.id };
  }
  return BigInt(calendarEventCursorSchema.parse(value).sortOrder);
}

function encodeCursor(row: EventRow, onDay: boolean) {
  return Buffer.from(
    JSON.stringify(
      onDay
        ? { startsAt: row.startsAt.toISOString(), id: row.id }
        : { sortOrder: row.sortOrder.toString() },
    ),
  ).toString("base64url");
}

function resultResponse(result: Awaited<ReturnType<CalendarEventRepository["update"]>>) {
  if (result.kind === "not_found") return error(404, "EVENT_NOT_FOUND", "Evento no encontrado.");
  if (result.kind === "conflict")
    return error(409, "VERSION_CONFLICT", "El evento cambió. Actualízalo antes de continuar.");
  return Response.json(toEvent(result.row));
}

export function registerCalendarEventRoutes(app: Hono, dependencies: Dependencies) {
  app.get("/v1/calendar-events", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const archivedQuery = c.req.query("archived");
    if (archivedQuery !== undefined && archivedQuery !== "true" && archivedQuery !== "false")
      return error(422, "VALIDATION_FAILED", "Filtro de eventos inválido.");
    const on = c.req.query("on");
    if (on && !z.iso.date().safeParse(on).success)
      return error(422, "VALIDATION_FAILED", "Fecha de agenda inválida.");
    const from = c.req.query("from");
    const through = c.req.query("through");
    if (
      (from !== undefined || through !== undefined) &&
      (!from ||
        !through ||
        on !== undefined ||
        !z.iso.date().safeParse(from).success ||
        !z.iso.date().safeParse(through).success ||
        through <= from ||
        through > shiftLocalDate(from, 31))
    )
      return error(422, "VALIDATION_FAILED", "Rango de agenda inválido; máximo 31 días.");
    const byDate = Boolean(on || from);
    if (byDate && archivedQuery === "true")
      return error(422, "VALIDATION_FAILED", "La agenda solo muestra eventos activos.");

    const rawCursor = c.req.query("cursor");
    let cursor: bigint | { startsAt: Date; id: string } | null = null;
    if (rawCursor !== undefined) {
      try {
        cursor = decodeCursor(rawCursor, byDate);
      } catch {
        return error(422, "INVALID_CURSOR", "Cursor inválido.");
      }
    }

    let rows: EventRow[];
    const startDay = on ?? from;
    const endDay = on ? shiftLocalDate(on, 1) : through;
    if (startDay && endDay) {
      const profile = await dependencies.profiles.get(session.user.id);
      if (!profile) return error(404, "PROFILE_NOT_FOUND", "Perfil no disponible.");
      const bounds = {
        startsAt: localDayBounds(startDay, profile.timeZone).startsAt,
        endsAt: localDayBounds(endDay, profile.timeZone).startsAt,
      };
      rows = await dependencies.events.listOnDay(
        session.user.id,
        { startsAt: new Date(bounds.startsAt), endsAt: new Date(bounds.endsAt) },
        cursor && typeof cursor === "object" ? cursor : null,
      );
    } else {
      rows = await dependencies.events.list(
        session.user.id,
        archivedQuery === "true",
        typeof cursor === "bigint" ? cursor : null,
      );
    }
    const pageRows = rows.slice(0, 20);
    const last = pageRows.at(-1);
    return c.json(
      calendarEventPageSchema.parse({
        items: pageRows.map(toEvent),
        nextCursor: rows.length > 20 && last ? encodeCursor(last, byDate) : null,
      }),
    );
  });

  app.get("/v1/calendar-events/:id", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const id = c.req.param("id");
    if (!z.uuid().safeParse(id).success)
      return error(404, "EVENT_NOT_FOUND", "Evento no encontrado.");
    const row = await dependencies.events.get(session.user.id, id);
    return row ? c.json(toEvent(row)) : error(404, "EVENT_NOT_FOUND", "Evento no encontrado.");
  });

  app.post("/v1/calendar-events", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const parsed = calendarEventCreateSchema.safeParse(await readBody(c.req.raw));
    if (!parsed.success) return error(422, "VALIDATION_FAILED", "Revisa los datos del evento.");
    try {
      const result = await dependencies.events.create(
        session.user.id,
        parsed.data.id,
        toFields(parsed.data),
      );
      if (result.kind === "conflict")
        return error(409, "EVENT_CONFLICT", "No se pudo guardar el evento.");
      return c.json(toEvent(result.row), result.kind === "created" ? 201 : 200);
    } catch (caught) {
      if (hasForeignKeyViolation(caught))
        return error(422, "INVALID_SUBJECT", "Elige una materia de tu cuenta.");
      throw caught;
    }
  });

  app.patch("/v1/calendar-events/:id", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const id = c.req.param("id");
    if (!z.uuid().safeParse(id).success)
      return error(404, "EVENT_NOT_FOUND", "Evento no encontrado.");
    const parsed = calendarEventUpdateSchema.safeParse(await readBody(c.req.raw));
    if (!parsed.success) return error(422, "VALIDATION_FAILED", "Revisa los datos del evento.");
    try {
      const result = await dependencies.events.update(session.user.id, id, {
        ...toFields(parsed.data),
        version: parsed.data.version,
        mutationId: parsed.data.mutationId,
      });
      return resultResponse(result);
    } catch (caught) {
      if (hasForeignKeyViolation(caught))
        return error(422, "INVALID_SUBJECT", "Elige una materia de tu cuenta.");
      throw caught;
    }
  });

  for (const archived of [true, false]) {
    app.post(`/v1/calendar-events/:id/${archived ? "archive" : "restore"}`, async (c) => {
      const session = await dependencies.getSession(c.req.raw.headers);
      if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
      const id = c.req.param("id");
      if (!z.uuid().safeParse(id).success)
        return error(404, "EVENT_NOT_FOUND", "Evento no encontrado.");
      const parsed = calendarEventVersionSchema.safeParse(await readBody(c.req.raw));
      if (!parsed.success) return error(422, "VALIDATION_FAILED", "Versión inválida.");
      const result = await dependencies.events.setArchived(session.user.id, id, {
        ...parsed.data,
        archived,
      });
      return resultResponse(result);
    });
  }
}
