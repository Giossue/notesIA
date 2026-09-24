import { accountExportRequestSchema, type Problem } from "@notesia/contracts";
import type { AccountExportRepository } from "@notesia/db";
import type { Hono } from "hono";

type Dependencies = {
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
  verifyPassword(headers: Headers, password: string): Promise<boolean>;
  exports: AccountExportRepository;
};

function error(status: 401 | 403 | 422, code: string, title: string) {
  const body: Problem = {
    type: `https://notesia.local/problems/${code.toLowerCase().replaceAll("_", "-")}`,
    title,
    status,
    code,
    requestId: crypto.randomUUID(),
  };
  return Response.json(body, { status, headers: { "Content-Type": "application/problem+json" } });
}

export function registerAccountExportRoutes(app: Hono, dependencies: Dependencies) {
  app.post("/v1/me/export", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    if (!c.req.header("content-type")?.toLowerCase().startsWith("application/json"))
      return error(422, "VALIDATION_FAILED", "Se requiere JSON.");
    const body = accountExportRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return error(422, "VALIDATION_FAILED", "Solicitud inválida.");
    if (!(await dependencies.verifyPassword(c.req.raw.headers, body.data.password)))
      return error(403, "REAUTH_REQUIRED", "Vuelve a confirmar tu contraseña.");
    const stream = await dependencies.exports.stream(session.user.id);
    return new Response(stream, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="notesia-export.json"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
