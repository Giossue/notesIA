import {
  academicPeriodCreateSchema,
  academicPeriodPageSchema,
  academicPeriodSchema,
  academicPeriodUpdateSchema,
  type Problem,
  subjectCursorSchema,
  subjectVersionSchema,
} from "@notesia/contracts";
import type { AcademicPeriodRepository } from "@notesia/db";
import type { Hono } from "hono";
import { z } from "zod";

type Dependencies = {
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
  periods: AcademicPeriodRepository;
};
type Period = NonNullable<Awaited<ReturnType<AcademicPeriodRepository["get"]>>>;

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
function toPeriod(row: Period) {
  return academicPeriodSchema.parse({
    id: row.id,
    name: row.name,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    version: row.version,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  });
}

export function registerAcademicPeriodRoutes(app: Hono, dependencies: Dependencies) {
  app.get("/v1/academic-periods", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const archived = c.req.query("archived");
    if (archived !== undefined && archived !== "true" && archived !== "false")
      return error(422, "VALIDATION_FAILED", "Filtro inválido.");
    const raw = c.req.query("cursor");
    let cursor: string | null = null;
    if (raw !== undefined) {
      try {
        if (raw.length > 256) throw new Error("Cursor too long");
        cursor = subjectCursorSchema.parse(
          JSON.parse(Buffer.from(raw, "base64url").toString()),
        ).sortOrder;
      } catch {
        return error(422, "VALIDATION_FAILED", "Cursor inválido.");
      }
    }
    const rows = await dependencies.periods.list(session.user.id, archived === "true", cursor);
    const page = rows.slice(0, 20);
    const last = page.at(-1);
    return c.json(
      academicPeriodPageSchema.parse({
        items: page.map(toPeriod),
        nextCursor:
          rows.length > 20 && last
            ? Buffer.from(JSON.stringify({ sortOrder: last.sortOrder })).toString("base64url")
            : null,
      }),
    );
  });

  app.get("/v1/academic-periods/:id", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const id = c.req.param("id");
    if (!z.uuid().safeParse(id).success) return error(404, "NOT_FOUND", "Periodo no encontrado.");
    const row = await dependencies.periods.get(session.user.id, id);
    return row ? c.json(toPeriod(row)) : error(404, "NOT_FOUND", "Periodo no encontrado.");
  });

  app.post("/v1/academic-periods", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const parsed = academicPeriodCreateSchema.safeParse(await readBody(c.req.raw));
    if (!parsed.success) return error(422, "VALIDATION_FAILED", "Periodo inválido.");
    const { id, ...fields } = parsed.data;
    const result = await dependencies.periods.create(session.user.id, id, fields);
    if (result.kind === "conflict") return error(409, "VERSION_CONFLICT", "Ese periodo ya existe.");
    return c.json(toPeriod(result.row), result.kind === "created" ? 201 : 200);
  });

  app.patch("/v1/academic-periods/:id", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const id = c.req.param("id");
    if (!z.uuid().safeParse(id).success) return error(404, "NOT_FOUND", "Periodo no encontrado.");
    const parsed = academicPeriodUpdateSchema.safeParse(await readBody(c.req.raw));
    if (!parsed.success) return error(422, "VALIDATION_FAILED", "Periodo inválido.");
    const row = await dependencies.periods.update(session.user.id, id, parsed.data);
    if (row) return c.json(toPeriod(row));
    const existing = await dependencies.periods.get(session.user.id, id);
    return existing
      ? error(409, "VERSION_CONFLICT", "El periodo cambió.")
      : error(404, "NOT_FOUND", "Periodo no encontrado.");
  });

  for (const archived of [true, false]) {
    app.post(`/v1/academic-periods/:id/${archived ? "archive" : "restore"}`, async (c) => {
      const session = await dependencies.getSession(c.req.raw.headers);
      if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
      const id = c.req.param("id");
      if (!z.uuid().safeParse(id).success) return error(404, "NOT_FOUND", "Periodo no encontrado.");
      const parsed = subjectVersionSchema.safeParse(await readBody(c.req.raw));
      if (!parsed.success) return error(422, "VALIDATION_FAILED", "Versión inválida.");
      const row = await dependencies.periods.archive(
        session.user.id,
        id,
        parsed.data.version,
        archived,
      );
      if (row) return c.json(toPeriod(row));
      const existing = await dependencies.periods.get(session.user.id, id);
      return existing
        ? error(409, "VERSION_CONFLICT", "El periodo cambió.")
        : error(404, "NOT_FOUND", "Periodo no encontrado.");
    });
  }
}
