import {
  notificationPageSchema,
  notificationPreferencesSchema,
  notificationPreferencesUpdateSchema,
  notificationReadAllSchema,
  notificationSchema,
  notificationUnreadSchema,
  versionSchema,
} from "@notesia/contracts";
import { z } from "zod";
import { requestJson } from "./client";

// Un tipo que esta versión de la app no conoce se muestra con su texto, sin
// romper la lista: el servidor puede estrenar avisos antes que la app.
const receivedNotificationSchema = notificationSchema.extend({ type: z.string() });
const receivedPageSchema = notificationPageSchema.extend({
  items: z.array(receivedNotificationSchema),
});
export type AppNotification = z.infer<typeof receivedNotificationSchema>;

export function listNotifications(cursor?: string) {
  const query = new URLSearchParams();
  if (cursor) query.set("cursor", cursor);
  return requestJson(`/notifications?${query.toString()}`, receivedPageSchema);
}

export function unreadNotificationCount() {
  return requestJson("/notifications/unread-count", notificationUnreadSchema);
}

export function markNotificationRead(id: string, version: number) {
  return requestJson(`/notifications/${encodeURIComponent(id)}/read`, receivedNotificationSchema, {
    method: "POST",
    body: versionSchema.parse({ version }),
  });
}

/** Marca como leídos los avisos creados hasta `until` (los que ya se vieron). */
export function markAllNotificationsRead(until: string) {
  return requestJson("/notifications/read-all", notificationUnreadSchema, {
    method: "POST",
    body: notificationReadAllSchema.parse({ until }),
  });
}

/** Marca leído un aviso reciente por su id (al abrirlo desde el push). */
export async function markNotificationReadById(id: string) {
  const page = await listNotifications();
  const item = page.items.find((notification) => notification.id === id);
  if (item && !item.readAt) await markNotificationRead(item.id, item.version);
}

export function getNotificationPreferences() {
  return requestJson("/me/notification-preferences", notificationPreferencesSchema);
}

export function updateNotificationPreferences(input: unknown) {
  return requestJson("/me/notification-preferences", notificationPreferencesSchema, {
    method: "PATCH",
    body: notificationPreferencesUpdateSchema.parse(input),
  });
}
