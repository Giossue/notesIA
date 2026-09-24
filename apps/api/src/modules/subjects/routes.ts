import {
  type Problem,
  subjectCreateSchema,
  subjectCursorSchema,
  subjectPageSchema,
  subjectSchema,
  subjectUpdateSchema,
  subjectVersionSchema,
} from "@notesia/contracts";
import type { SubjectRepository } from "@notesia/db";
import type { Hono } from "hono";
import { z } from "zod";

type Session = { user: { id: string } };
type Dependencies = {
  getSession(headers: Headers): Promise<Session | null>;
  subjects: SubjectRepository;
};

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
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Promise.resolve(null);
  }
  return request.json().catch(() => null);
}

function toSubject(row: Awaited<ReturnType<SubjectRepository["get"]>>) {
  if (!row) throw new Error("Expected a subject row");
  return subjectSchema.parse({
    id: row.id,
    periodId: row.periodId,
    name: row.name,
    code: row.code,
    colorToken: row.colorToken,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  });
}

function hasUniqueViolation(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const errorValue = value as { code?: unknown; cause?: unknown };
  return errorValue.code === "23505" || hasUniqueViolation(errorValue.cause);
}
function hasForeignKeyViolation(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const caught = value as { code?: unknown; cause?: unknown };
  return caught.code === "23503" || hasForeignKeyViolation(caught.cause);
}

export function registerSubjectRoutes(app: Hono, dependencies: Dependencies) {
  app.get("/v1/subjects", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");

    const archivedQuery = c.req.query("archived");
    if (archivedQuery !== undefined && archivedQuery !== "true" && archivedQuery !== "false") {
      return error(422, "VALIDATION_FAILED", "Filtro de materias inválido.");
    }
    const rawCursor = c.req.query("cursor");
    let cursor: bigint | null = null;
    if (rawCursor) {
      if (rawCursor.length > 256) return error(422, "INVALID_CURSOR", "Cursor inválido.");
      try {
        const parsed = subjectCursorSchema.parse(
          JSON.parse(Buffer.from(rawCursor, "base64url").toString("utf8")),
        );
        cursor = BigInt(parsed.sortOrder);
      } catch {
        return error(422, "INVALID_CURSOR", "Cursor inválido.");
      }
    }

    const rows = await dependencies.subjects.list(
      session.user.id,
      archivedQuery === "true",
      cursor,
    );
    const pageRows = rows.slice(0, 20);
    const last = pageRows.at(-1);
    return c.json(
      subjectPageSchema.parse({
        items: pageRows.map(toSubject),
        nextCursor:
          rows.length > 20 && last
            ? Buffer.from(JSON.stringify({ sortOrder: last.sortOrder.toString() })).toString(
                "base64url",
              )
            : null,
      }),
    );
  });

  app.get("/v1/subjects/:id", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    if (!z.uuid().safeParse(c.req.param("id")).success)
      return error(404, "SUBJECT_NOT_FOUND", "Materia no encontrada.");
    const row = await dependencies.subjects.get(session.user.id, c.req.param("id"));
    return row ? c.json(toSubject(row)) : error(404, "SUBJECT_NOT_FOUND", "Materia no encontrada.");
  });

  app.post("/v1/subjects", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const parsed = subjectCreateSchema.safeParse(await readBody(c.req.raw));
    if (!parsed.success) return error(422, "VALIDATION_FAILED", "Revisa los datos de la materia.");
    try {
      const result = await dependencies.subjects.create(
        session.user.id,
        parsed.data.id,
        parsed.data,
      );
      if (!result) return error(409, "SUBJECT_CONFLICT", "No se pudo guardar la materia.");
      return c.json(toSubject(result.row), result.created ? 201 : 200);
    } catch (caught) {
      if (hasForeignKeyViolation(caught))
        return error(422, "INVALID_PERIOD", "Elige un periodo de tu cuenta.");
      throw caught;
    }
  });

  app.patch("/v1/subjects/:id", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const id = c.req.param("id");
    if (!z.uuid().safeParse(id).success)
      return error(404, "SUBJECT_NOT_FOUND", "Materia no encontrada.");
    const parsed = subjectUpdateSchema.safeParse(await readBody(c.req.raw));
    if (!parsed.success) return error(422, "VALIDATION_FAILED", "Revisa los datos de la materia.");
    let row: Awaited<ReturnType<SubjectRepository["update"]>>;
    try {
      row = await dependencies.subjects.update(session.user.id, id, parsed.data);
    } catch (caught) {
      if (hasUniqueViolation(caught))
        return error(409, "SUBJECT_CODE_CONFLICT", "Ese código ya se usa en otra materia.");
      if (hasForeignKeyViolation(caught))
        return error(422, "INVALID_PERIOD", "Elige un periodo de tu cuenta.");
      throw caught;
    }
    if (row) return c.json(toSubject(row));
    const existing = await dependencies.subjects.get(session.user.id, id);
    return existing
      ? error(409, "VERSION_CONFLICT", "La materia cambió. Actualízala antes de guardar.")
      : error(404, "SUBJECT_NOT_FOUND", "Materia no encontrada.");
  });

  for (const archived of [true, false]) {
    app.post(`/v1/subjects/:id/${archived ? "archive" : "restore"}`, async (c) => {
      const session = await dependencies.getSession(c.req.raw.headers);
      if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
      const id = c.req.param("id");
      if (!z.uuid().safeParse(id).success)
        return error(404, "SUBJECT_NOT_FOUND", "Materia no encontrada.");
      const parsed = subjectVersionSchema.safeParse(await readBody(c.req.raw));
      if (!parsed.success) return error(422, "VALIDATION_FAILED", "Versión inválida.");
      const row = await dependencies.subjects.setArchived(
        session.user.id,
        id,
        parsed.data.version,
        archived,
      );
      if (row) return c.json(toSubject(row));
      const existing = await dependencies.subjects.get(session.user.id, id);
      return existing
        ? error(409, "VERSION_CONFLICT", "La materia cambió. Actualízala antes de continuar.")
        : error(404, "SUBJECT_NOT_FOUND", "Materia no encontrada.");
    });
  }
}
