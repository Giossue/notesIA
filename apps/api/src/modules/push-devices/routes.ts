import { type Problem, pushDeviceListSchema, pushDeviceRegisterSchema } from "@notesia/contracts";
import type { PushDeviceRepository, PushTokenCipher } from "@notesia/db";
import type { Hono } from "hono";
import { z } from "zod";

type Dependencies = {
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
  devices: PushDeviceRepository;
  cipher: PushTokenCipher | null;
};

function error(status: 401 | 404 | 409 | 422 | 503, code: string, title: string) {
  const body: Problem = {
    type: `https://notesia.local/problems/${code.toLowerCase().replaceAll("_", "-")}`,
    title,
    status,
    code,
    requestId: crypto.randomUUID(),
  };
  return Response.json(body, { status, headers: { "Content-Type": "application/problem+json" } });
}

export function registerPushDeviceRoutes(app: Hono, dependencies: Dependencies) {
  app.get("/v1/me/push-devices", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const rows = await dependencies.devices.list(session.user.id);
    return c.json(
      pushDeviceListSchema.parse(
        rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })),
      ),
    );
  });
  app.post("/v1/me/push-devices", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    if (!c.req.header("content-type")?.toLowerCase().startsWith("application/json"))
      return error(422, "VALIDATION_FAILED", "Se requiere JSON.");
    const body = pushDeviceRegisterSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return error(422, "VALIDATION_FAILED", "Dispositivo inválido.");
    if (!dependencies.cipher) return error(503, "SERVICE_UNAVAILABLE", "Push no está configurado.");
    const encrypted = dependencies.cipher.encrypt(session.user.id, body.data.id, body.data.token);
    const result = await dependencies.devices.upsert(
      session.user.id,
      body.data.id,
      body.data.platform,
      encrypted,
    );
    if (result.kind === "limit_reached")
      return error(409, "DEVICE_LIMIT_REACHED", "Quita un dispositivo antes de agregar otro.");
    return c.json({ id: body.data.id, platform: body.data.platform, registered: true });
  });
  app.delete("/v1/me/push-devices/:id", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const id = z.uuid().safeParse(c.req.param("id"));
    if (!id.success) return error(404, "NOT_FOUND", "Dispositivo no encontrado.");
    const removed = await dependencies.devices.remove(session.user.id, id.data);
    return removed
      ? new Response(null, { status: 204 })
      : error(404, "NOT_FOUND", "Dispositivo no encontrado.");
  });
}
