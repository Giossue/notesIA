import {
  notificationPageSchema,
  notificationPreferencesSchema,
  notificationPreferencesUpdateSchema,
  notificationSchema,
  subjectVersionSchema,
} from "@notesia/contracts";
import { requestJson } from "./client";

export function listNotifications(cursor?: string) {
  const query = new URLSearchParams();
  if (cursor) query.set("cursor", cursor);
  return requestJson(`/notifications?${query.toString()}`, notificationPageSchema);
}

export function markNotificationRead(id: string, version: number) {
  return requestJson(`/notifications/${encodeURIComponent(id)}/read`, notificationSchema, {
    method: "POST",
    body: subjectVersionSchema.parse({ version }),
  });
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
