import {
  availabilityCapacitySchema,
  availabilityExceptionListSchema,
  availabilityExceptionSchema,
  availabilityExceptionWriteSchema,
  availabilityRuleCreateSchema,
  availabilityRuleListSchema,
  availabilityRuleSchema,
  availabilityRuleUpdateSchema,
  dateRangeSchema,
  type Problem,
  subjectVersionSchema,
} from "@notesia/contracts";
import type {
  AvailabilityRepository,
  CalendarEventRepository,
  ProfileRepository,
} from "@notesia/db";
import { calculateAvailability, localDayBounds, shiftLocalDate } from "@notesia/domain";
import type { Hono } from "hono";
import { z } from "zod";

type Dependencies = {
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
  availability: AvailabilityRepository;
  events: CalendarEventRepository;
  profiles: ProfileRepository;
};

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

function toRule(row: NonNullable<Awaited<ReturnType<AvailabilityRepository["getRule"]>>>) {
  return availabilityRuleSchema.parse({
    ...row,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  });
}

function toException(
  row: NonNullable<Awaited<ReturnType<AvailabilityRepository["getException"]>>>,
) {
  return availabilityExceptionSchema.parse({
    ...row,
    updatedAt: row.updatedAt.toISOString(),
  });
}

function range(query: Record<string, string>) {
  const parsed = dateRangeSchema.safeParse(query);
  if (!parsed.success) return null;
  const { from, through } = parsed.data;
  if (through <= from || through > shiftLocalDate(from, 31)) return null;
  return parsed.data;
}

export function registerAvailabilityRoutes(app: Hono, dependencies: Dependencies) {
  app.get("/v1/availability-rules", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const items = await dependencies.availability.listRules(session.user.id);
    return c.json(availabilityRuleListSchema.parse({ items: items.map(toRule) }));
  });

  app.post("/v1/availability-rules", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const parsed = availabilityRuleCreateSchema.safeParse(await readBody(c.req.raw));
    if (!parsed.success) return error(422, "VALIDATION_FAILED", "Regla inválida.");
    const { id, ...fields } = parsed.data;
    const result = await dependencies.availability.createRule(session.user.id, id, fields);
    if (result.kind === "conflict")
      return error(409, "VERSION_CONFLICT", "Regla ya registrada con otros datos.");
    return c.json(toRule(result.row), result.kind === "created" ? 201 : 200);
  });

  app.patch("/v1/availability-rules/:id", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const id = c.req.param("id");
    if (!z.uuid().safeParse(id).success) return error(404, "NOT_FOUND", "Regla no encontrada.");
    const parsed = availabilityRuleUpdateSchema.safeParse(await readBody(c.req.raw));
    if (!parsed.success) return error(422, "VALIDATION_FAILED", "Regla inválida.");
    const row = await dependencies.availability.updateRule(session.user.id, id, parsed.data);
    if (row) return c.json(toRule(row));
    const existing = await dependencies.availability.getRule(session.user.id, id);
    return existing
      ? error(409, "VERSION_CONFLICT", "La regla cambió. Actualízala antes de continuar.")
      : error(404, "NOT_FOUND", "Regla no encontrada.");
  });

  for (const archived of [true, false]) {
    app.post(`/v1/availability-rules/:id/${archived ? "archive" : "restore"}`, async (c) => {
      const session = await dependencies.getSession(c.req.raw.headers);
      if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
      const id = c.req.param("id");
      if (!z.uuid().safeParse(id).success) return error(404, "NOT_FOUND", "Regla no encontrada.");
      const parsed = subjectVersionSchema.safeParse(await readBody(c.req.raw));
      if (!parsed.success) return error(422, "VALIDATION_FAILED", "Versión inválida.");
      const row = await dependencies.availability.archiveRule(
        session.user.id,
        id,
        parsed.data.version,
        archived,
      );
      if (row) return c.json(toRule(row));
      const existing = await dependencies.availability.getRule(session.user.id, id);
      return existing
        ? error(409, "VERSION_CONFLICT", "La regla cambió. Actualízala antes de continuar.")
        : error(404, "NOT_FOUND", "Regla no encontrada.");
    });
  }

  app.get("/v1/availability-exceptions", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const dates = range(c.req.query());
    if (!dates) return error(422, "VALIDATION_FAILED", "Rango inválido; máximo 31 días.");
    const items = await dependencies.availability.listExceptions(
      session.user.id,
      dates.from,
      dates.through,
    );
    return c.json(availabilityExceptionListSchema.parse({ items: items.map(toException) }));
  });

  app.put("/v1/availability-exceptions/:date", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const date = c.req.param("date");
    if (!z.iso.date().safeParse(date).success)
      return error(422, "VALIDATION_FAILED", "Fecha inválida.");
    const parsed = availabilityExceptionWriteSchema.safeParse(await readBody(c.req.raw));
    if (!parsed.success) return error(422, "VALIDATION_FAILED", "Excepción inválida.");
    const row = await dependencies.availability.replaceException(
      session.user.id,
      date,
      parsed.data.version,
      parsed.data.windows,
    );
    if (!row)
      return error(409, "VERSION_CONFLICT", "La excepción cambió. Actualízala antes de continuar.");
    return c.json(toException(row), parsed.data.version === null ? 201 : 200);
  });

  app.get("/v1/availability/capacity", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const dates = range(c.req.query());
    if (!dates) return error(422, "VALIDATION_FAILED", "Rango inválido; máximo 31 días.");
    const profile = await dependencies.profiles.get(session.user.id);
    if (!profile) return error(404, "NOT_FOUND", "Perfil no disponible.");
    const start = localDayBounds(dates.from, profile.timeZone).startsAt;
    const end = localDayBounds(dates.through, profile.timeZone).startsAt;
    const [rules, exceptions, events] = await Promise.all([
      dependencies.availability.listRules(session.user.id),
      dependencies.availability.listExceptions(
        session.user.id,
        shiftLocalDate(dates.from, -1),
        dates.through,
      ),
      dependencies.events.listInRange(session.user.id, {
        startsAt: new Date(start),
        endsAt: new Date(end),
      }),
    ]);
    const calculated = calculateAvailability({
      ...dates,
      timeZone: profile.timeZone,
      rules: rules.filter((rule) => !rule.archivedAt),
      exceptions,
      blocked: events.map((event) => ({
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt.toISOString(),
      })),
    });
    return c.json(
      availabilityCapacitySchema.parse({ ...dates, timeZone: profile.timeZone, ...calculated }),
    );
  });
}
