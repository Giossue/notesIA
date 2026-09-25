import {
  activitySeriesCreateSchema,
  activitySeriesCursorSchema,
  activitySeriesPageSchema,
  activitySeriesSchema,
  type Problem,
} from "@notesia/contracts";
import type { ActivitySeriesRepository, ProfileRepository } from "@notesia/db";
import { expandRecurrence } from "@notesia/domain";
import type { Hono } from "hono";
import { z } from "zod";

type Dependencies = {
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
  series: ActivitySeriesRepository;
  profiles: ProfileRepository;
};
type Series = NonNullable<Awaited<ReturnType<ActivitySeriesRepository["get"]>>>;

function problem(status: 401 | 404 | 409 | 422, code: string, title: string): Response {
  const body: Problem = {
    type: `https://notesia.local/problems/${code.toLowerCase().replaceAll("_", "-")}`,
    title,
    status,
    code,
    requestId: crypto.randomUUID(),
  };
  return Response.json(body, { status, headers: { "Content-Type": "application/problem+json" } });
}

function toSeries(row: Series) {
  const { sortOrder: _sortOrder, ...data } = row;
  return activitySeriesSchema.parse({ ...data, createdAt: row.createdAt.toISOString() });
}

export function registerActivitySeriesRoutes(app: Hono, dependencies: Dependencies) {
  app.get("/v1/activity-series", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return problem(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const rawCursor = c.req.query("cursor");
    let cursor: string | null = null;
    if (rawCursor !== undefined) {
      try {
        if (rawCursor.length > 256) throw new Error("Cursor too long");
        const parsed = activitySeriesCursorSchema.parse(
          JSON.parse(Buffer.from(rawCursor, "base64url").toString("utf8")),
        );
        cursor = parsed.sortOrder;
      } catch {
        return problem(422, "INVALID_CURSOR", "Cursor inválido.");
      }
    }
    const rows = await dependencies.series.list(session.user.id, cursor);
    const pageRows = rows.slice(0, 20);
    const last = pageRows.at(-1);
    return c.json(
      activitySeriesPageSchema.parse({
        items: pageRows.map(toSeries),
        nextCursor:
          rows.length > 20 && last
            ? Buffer.from(JSON.stringify({ sortOrder: last.sortOrder })).toString("base64url")
            : null,
      }),
    );
  });

  app.get("/v1/activity-series/:id", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return problem(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const id = c.req.param("id");
    if (!z.uuid().safeParse(id).success)
      return problem(404, "SERIES_NOT_FOUND", "Serie no encontrada.");
    const row = await dependencies.series.get(session.user.id, id);
    return row ? c.json(toSeries(row)) : problem(404, "SERIES_NOT_FOUND", "Serie no encontrada.");
  });

  app.post("/v1/activity-series", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return problem(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const raw = c.req.raw.headers.get("content-type")?.toLowerCase().startsWith("application/json")
      ? await c.req.raw.json().catch(() => null)
      : null;
    const parsed = activitySeriesCreateSchema.safeParse(raw);
    if (!parsed.success) return problem(422, "VALIDATION_FAILED", "Serie de actividad inválida.");
    const profile = await dependencies.profiles.get(session.user.id);
    if (!profile) return problem(404, "PROFILE_NOT_FOUND", "Perfil no disponible.");
    let occurrences: ReturnType<typeof expandRecurrence>;
    try {
      occurrences = expandRecurrence({
        frequency: parsed.data.frequency,
        startOn: parsed.data.startOn,
        throughOn: parsed.data.throughOn,
        timeZone: profile.timeZone,
      });
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return problem(
        422,
        "VALIDATION_FAILED",
        "Rango de recurrencia inválido; máximo 60 instancias en 366 días.",
      );
    }
    const result = await dependencies.series.create(
      session.user.id,
      parsed.data,
      profile.timeZone,
      occurrences,
    );
    if (result.kind === "conflict")
      return problem(409, "VERSION_CONFLICT", "El identificador de serie ya se utilizó.");
    return c.json(toSeries(result.row), result.kind === "created" ? 201 : 200);
  });
}
