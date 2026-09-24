import {
  accountDeletionCancelSchema,
  accountDeletionRequestSchema,
  accountDeletionStatusSchema,
  type Problem,
} from "@notesia/contracts";
import type { AccountDeletionRepository, DeletionRequest } from "@notesia/db";
import type { Hono } from "hono";

type Dependencies = {
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
  verifyPassword(headers: Headers, password: string): Promise<boolean>;
  deletions: AccountDeletionRepository | null;
};

function error(status: 401 | 403 | 409 | 422 | 503, code: string, title: string) {
  const body: Problem = {
    type: `https://notesia.local/problems/${code.toLowerCase().replaceAll("_", "-")}`,
    title,
    status,
    code,
    requestId: crypto.randomUUID(),
  };
  return Response.json(body, { status, headers: { "Content-Type": "application/problem+json" } });
}

function response(row: DeletionRequest) {
  return accountDeletionStatusSchema.parse({
    status: row.status,
    blockedReason: row.blockedReason,
    requestedAt: row.requestedAt.toISOString(),
    executeAt: row.executeAt.toISOString(),
  });
}

async function bodyOf(c: {
  req: { header(name: string): string | undefined; json(): Promise<unknown> };
}) {
  if (!c.req.header("content-type")?.toLowerCase().startsWith("application/json")) return null;
  return c.req.json().catch(() => null);
}

export function registerAccountDeletionRoutes(app: Hono, dependencies: Dependencies) {
  app.get("/v1/me/deletion-request", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    if (!dependencies.deletions)
      return error(503, "POLICY_UNAVAILABLE", "La eliminación de cuenta no está configurada.");
    const row = await dependencies.deletions.get(session.user.id);
    return c.json(row ? response(row) : null, 200, { "Cache-Control": "no-store" });
  });

  app.post("/v1/me/deletion-request", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    if (!dependencies.deletions)
      return error(503, "POLICY_UNAVAILABLE", "La eliminación de cuenta no está configurada.");
    const parsed = accountDeletionRequestSchema.safeParse(await bodyOf(c));
    if (!parsed.success) return error(422, "VALIDATION_FAILED", "Solicitud inválida.");
    if (!(await dependencies.verifyPassword(c.req.raw.headers, parsed.data.password)))
      return error(403, "REAUTH_REQUIRED", "Vuelve a confirmar tu contraseña.");
    const result = await dependencies.deletions.request(session.user.id);
    if (result.kind === "last_admin")
      return error(409, "LAST_ADMIN", "La última cuenta administradora no se puede eliminar.");
    if (result.kind === "policy_mismatch")
      return error(409, "POLICY_CHANGED", "La política de eliminación cambió.");
    return c.json(response(result.request), 202, { "Cache-Control": "no-store" });
  });

  app.delete("/v1/me/deletion-request", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    if (!dependencies.deletions)
      return error(503, "POLICY_UNAVAILABLE", "La eliminación de cuenta no está configurada.");
    const parsed = accountDeletionCancelSchema.safeParse(await bodyOf(c));
    if (!parsed.success) return error(422, "VALIDATION_FAILED", "Solicitud inválida.");
    if (!(await dependencies.verifyPassword(c.req.raw.headers, parsed.data.password)))
      return error(403, "REAUTH_REQUIRED", "Vuelve a confirmar tu contraseña.");
    await dependencies.deletions.cancel(session.user.id);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  });
}
