import {
  type Problem,
  reportCreateSchema,
  reportListSchema,
  reportSchema,
} from "@notesia/contracts";
import type { ReportRepository, ReportRow } from "@notesia/db";
import type { Hono } from "hono";

type Dependencies = {
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
  reports: ReportRepository;
};

function error(status: 401 | 409 | 422, code: string, title: string) {
  const body: Problem = {
    type: `https://notesia.local/problems/${code.toLowerCase().replaceAll("_", "-")}`,
    title,
    status,
    code,
    requestId: crypto.randomUUID(),
  };
  return Response.json(body, { status, headers: { "Content-Type": "application/problem+json" } });
}

function toReport(row: ReportRow) {
  return reportSchema.parse({
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    status: row.status,
    reply: row.reply,
    repliedAt: row.repliedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

/** Reportes del estudiante: los envía desde la app y ve la respuesta de soporte. */
export function registerReportRoutes(app: Hono, dependencies: Dependencies) {
  app.get("/v1/reports", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const rows = await dependencies.reports.listMine(session.user.id);
    return c.json(reportListSchema.parse({ items: rows.map(toReport) }));
  });

  app.post("/v1/reports", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const body = reportCreateSchema.safeParse(
      c.req.header("content-type")?.toLowerCase().startsWith("application/json")
        ? await c.req.json().catch(() => null)
        : null,
    );
    if (!body.success) return error(422, "VALIDATION_FAILED", "Revisa los datos del reporte.");
    const row = await dependencies.reports.create(session.user.id, body.data);
    // El id ya existe y es de otra cuenta.
    if (!row) return error(409, "VERSION_CONFLICT", "Ese reporte ya existe.");
    return c.json(toReport(row), 201);
  });
}
