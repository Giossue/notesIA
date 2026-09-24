import {
  type Problem,
  subtaskCreateSchema,
  subtaskCursorSchema,
  subtaskPageSchema,
  subtaskSchema,
  subtaskUpdateSchema,
  subtaskVersionSchema,
} from "@notesia/contracts";
import type { ActivityRepository, SubtaskRepository } from "@notesia/db";
import type { Hono } from "hono";
import { z } from "zod";

type Session = { user: { id: string } };
type Dependencies = {
  getSession(headers: Headers): Promise<Session | null>;
  activities: ActivityRepository;
  subtasks: SubtaskRepository;
};
type SubtaskRow = NonNullable<Awaited<ReturnType<SubtaskRepository["get"]>>>;

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

function toSubtask(row: SubtaskRow) {
  return subtaskSchema.parse({
    id: row.id,
    activityId: row.activityId,
    title: row.title,
    estimatedMinutes: row.estimatedMinutes,
    isCompleted: row.isCompleted,
    completedAt: row.completedAt?.toISOString() ?? null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function validIds(activityId: string, subtaskId?: string) {
  return (
    z.uuid().safeParse(activityId).success &&
    (subtaskId === undefined || z.uuid().safeParse(subtaskId).success)
  );
}

function resultResponse(result: Awaited<ReturnType<SubtaskRepository["update"]>>): Response {
  if (result.kind === "not_found")
    return error(404, "SUBTASK_NOT_FOUND", "Subtarea no encontrada.");
  if (result.kind === "conflict")
    return error(409, "VERSION_CONFLICT", "La subtarea cambió. Actualízala antes de continuar.");
  return Response.json(toSubtask(result.row));
}

export function registerSubtaskRoutes(app: Hono, dependencies: Dependencies) {
  app.get("/v1/activities/:activityId/subtasks", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const activityId = c.req.param("activityId");
    if (!validIds(activityId)) return error(404, "ACTIVITY_NOT_FOUND", "Actividad no encontrada.");
    const parent = await dependencies.activities.get(session.user.id, activityId);
    if (!parent) return error(404, "ACTIVITY_NOT_FOUND", "Actividad no encontrada.");

    const archivedQuery = c.req.query("archived");
    if (archivedQuery !== undefined && archivedQuery !== "true" && archivedQuery !== "false")
      return error(422, "VALIDATION_FAILED", "Filtro de subtareas inválido.");
    const rawCursor = c.req.query("cursor");
    let cursor: bigint | null = null;
    if (rawCursor !== undefined) {
      if (rawCursor.length > 256) return error(422, "INVALID_CURSOR", "Cursor inválido.");
      try {
        const value: unknown = JSON.parse(Buffer.from(rawCursor, "base64url").toString("utf8"));
        cursor = BigInt(subtaskCursorSchema.parse(value).sortOrder);
      } catch {
        return error(422, "INVALID_CURSOR", "Cursor inválido.");
      }
    }
    const rows = await dependencies.subtasks.list(
      session.user.id,
      activityId,
      archivedQuery === "true",
      cursor,
    );
    const pageRows = rows.slice(0, 20);
    const last = pageRows.at(-1);
    return c.json(
      subtaskPageSchema.parse({
        items: pageRows.map(toSubtask),
        nextCursor:
          rows.length > 20 && last
            ? Buffer.from(JSON.stringify({ sortOrder: last.sortOrder.toString() })).toString(
                "base64url",
              )
            : null,
      }),
    );
  });

  app.post("/v1/activities/:activityId/subtasks", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const activityId = c.req.param("activityId");
    if (!validIds(activityId)) return error(404, "ACTIVITY_NOT_FOUND", "Actividad no encontrada.");
    const parsed = subtaskCreateSchema.safeParse(await readBody(c.req.raw));
    if (!parsed.success) return error(422, "VALIDATION_FAILED", "Revisa los datos de la subtarea.");
    const result = await dependencies.subtasks.create(session.user.id, activityId, parsed.data.id, {
      title: parsed.data.title,
      estimatedMinutes: parsed.data.estimatedMinutes,
    });
    if (result.kind === "not_found")
      return error(404, "ACTIVITY_NOT_FOUND", "Actividad no encontrada.");
    if (result.kind === "conflict")
      return error(409, "SUBTASK_CONFLICT", "No se pudo guardar la subtarea.");
    return c.json(toSubtask(result.row), result.kind === "created" ? 201 : 200);
  });

  app.get("/v1/activities/:activityId/subtasks/:subtaskId", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const { activityId, subtaskId } = c.req.param();
    if (!validIds(activityId, subtaskId))
      return error(404, "SUBTASK_NOT_FOUND", "Subtarea no encontrada.");
    const row = await dependencies.subtasks.get(session.user.id, activityId, subtaskId);
    return row
      ? c.json(toSubtask(row))
      : error(404, "SUBTASK_NOT_FOUND", "Subtarea no encontrada.");
  });

  app.patch("/v1/activities/:activityId/subtasks/:subtaskId", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const { activityId, subtaskId } = c.req.param();
    if (!validIds(activityId, subtaskId))
      return error(404, "SUBTASK_NOT_FOUND", "Subtarea no encontrada.");
    const parsed = subtaskUpdateSchema.safeParse(await readBody(c.req.raw));
    if (!parsed.success) return error(422, "VALIDATION_FAILED", "Revisa los datos de la subtarea.");
    const result = await dependencies.subtasks.update(
      session.user.id,
      activityId,
      subtaskId,
      parsed.data,
    );
    return resultResponse(result);
  });

  for (const archived of [true, false]) {
    app.post(
      `/v1/activities/:activityId/subtasks/:subtaskId/${archived ? "archive" : "restore"}`,
      async (c) => {
        const session = await dependencies.getSession(c.req.raw.headers);
        if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
        const { activityId, subtaskId } = c.req.param();
        if (!validIds(activityId, subtaskId))
          return error(404, "SUBTASK_NOT_FOUND", "Subtarea no encontrada.");
        const parsed = subtaskVersionSchema.safeParse(await readBody(c.req.raw));
        if (!parsed.success) return error(422, "VALIDATION_FAILED", "Versión inválida.");
        const result = await dependencies.subtasks.setArchived(
          session.user.id,
          activityId,
          subtaskId,
          { ...parsed.data, archived },
        );
        return resultResponse(result);
      },
    );
  }
}
