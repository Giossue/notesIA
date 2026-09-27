import {
  notificationPageSchema,
  notificationPreferencesSchema,
  notificationPreferencesUpdateSchema,
  notificationReadAllSchema,
  notificationSchema,
  notificationUnreadSchema,
  type Problem,
  timeEntryCursorSchema,
  versionSchema,
} from "@notesia/contracts";
import type { NotificationPreferenceRepository, NotificationRepository } from "@notesia/db";
import { pushMessage } from "@notesia/domain";
import type { Hono } from "hono";
import { z } from "zod";

type Dependencies = {
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
  notifications: NotificationRepository;
  preferences?: NotificationPreferenceRepository;
};
type Notification = NonNullable<Awaited<ReturnType<NotificationRepository["get"]>>>;
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
function toNotification(row: Notification) {
  // Mismo texto que el push; "hoy" y "mañana" se cuentan desde que se creó.
  const { title, body } = pushMessage({
    type: row.type,
    activityTitle: row.activityTitle,
    referenceAt: row.referenceAt,
    timeZone: row.timeZone,
    now: row.createdAt,
    announcement:
      row.announcementTitle !== null && row.announcementBody !== null
        ? { title: row.announcementTitle, body: row.announcementBody }
        : null,
  });
  return notificationSchema.parse({
    id: row.id,
    type: row.type,
    title,
    body,
    planId: row.planId,
    activityId: row.activityId,
    blockId: row.blockId,
    reportId: row.reportId,
    referenceAt: row.referenceAt?.toISOString() ?? null,
    version: row.version,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  });
}
function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return Promise.resolve(null);
  return request.json().catch(() => null);
}

export function registerNotificationRoutes(app: Hono, dependencies: Dependencies) {
  if (dependencies.preferences) {
    const preferences = dependencies.preferences;
    app.get("/v1/me/notification-preferences", async (c) => {
      const session = await dependencies.getSession(c.req.raw.headers);
      if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
      const row = await preferences.get(session.user.id);
      if (!row) return error(404, "NOT_FOUND", "Preferencias no disponibles.");
      return c.json(
        notificationPreferencesSchema.parse({ ...row, updatedAt: row.updatedAt.toISOString() }),
      );
    });
    app.patch("/v1/me/notification-preferences", async (c) => {
      const session = await dependencies.getSession(c.req.raw.headers);
      if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
      const body = notificationPreferencesUpdateSchema.safeParse(await readBody(c.req.raw));
      if (!body.success) return error(422, "VALIDATION_FAILED", "Preferencias inválidas.");
      const row = await preferences.update(session.user.id, body.data);
      if (!row) return error(409, "VERSION_CONFLICT", "Las preferencias cambiaron.");
      return c.json(
        notificationPreferencesSchema.parse({ ...row, updatedAt: row.updatedAt.toISOString() }),
      );
    });
  }
  app.get("/v1/notifications", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const raw = c.req.query("cursor");
    let cursor: { createdAt: string; id: string } | null = null;
    if (raw !== undefined) {
      try {
        if (raw.length > 256) throw new Error("Cursor too long");
        const parsed = timeEntryCursorSchema.parse(
          JSON.parse(Buffer.from(raw, "base64url").toString()),
        );
        cursor = { createdAt: parsed.createdAt, id: parsed.id };
      } catch {
        return error(422, "VALIDATION_FAILED", "Cursor inválido.");
      }
    }
    const rows = await dependencies.notifications.list(session.user.id, cursor);
    const page = rows.slice(0, 20);
    const last = page.at(-1);
    return c.json(
      notificationPageSchema.parse({
        items: page.map(toNotification),
        nextCursor:
          rows.length > 20 && last
            ? Buffer.from(
                JSON.stringify({ createdAt: last.cursorCreatedAt, id: last.id }),
              ).toString("base64url")
            : null,
      }),
    );
  });
  app.get("/v1/notifications/unread-count", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    return c.json(
      notificationUnreadSchema.parse({
        count: await dependencies.notifications.unreadCount(session.user.id),
      }),
    );
  });
  app.post("/v1/notifications/read-all", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const parsed = notificationReadAllSchema.safeParse(await readBody(c.req.raw));
    if (!parsed.success) return error(422, "VALIDATION_FAILED", "Fecha inválida.");
    await dependencies.notifications.markAllRead(session.user.id, new Date(parsed.data.until));
    return c.json(
      notificationUnreadSchema.parse({
        count: await dependencies.notifications.unreadCount(session.user.id),
      }),
    );
  });
  app.post("/v1/notifications/:id/read", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const id = c.req.param("id");
    if (!z.uuid().safeParse(id).success) return error(404, "NOT_FOUND", "Aviso no encontrado.");
    const parsed = versionSchema.safeParse(await readBody(c.req.raw));
    if (!parsed.success) return error(422, "VALIDATION_FAILED", "Versión inválida.");
    const row = await dependencies.notifications.markRead(session.user.id, id, parsed.data.version);
    if (row) return c.json(toNotification(row));
    const existing = await dependencies.notifications.get(session.user.id, id);
    return existing
      ? error(409, "VERSION_CONFLICT", "El aviso cambió.")
      : error(404, "NOT_FOUND", "Aviso no encontrado.");
  });
}
