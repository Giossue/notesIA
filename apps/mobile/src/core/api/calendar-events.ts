import {
  type CalendarEventCreate,
  type CalendarEventUpdate,
  calendarEventCreateSchema,
  calendarEventPageSchema,
  calendarEventSchema,
  calendarEventUpdateSchema,
  calendarEventVersionSchema,
} from "@notesia/contracts";
import { requestJson } from "./client";

export function listCalendarEvents(
  filter: {
    archived?: boolean;
    on?: string;
    from?: string;
    through?: string;
    cursor?: string;
  } = {},
) {
  const query = new URLSearchParams({
    archived: String(filter.archived ?? false),
  });
  if (filter.on) query.set("on", filter.on);
  if (filter.from) query.set("from", filter.from);
  if (filter.through) query.set("through", filter.through);
  if (filter.cursor) query.set("cursor", filter.cursor);
  return requestJson(`/calendar-events?${query.toString()}`, calendarEventPageSchema);
}

export function getCalendarEvent(id: string) {
  return requestJson(`/calendar-events/${encodeURIComponent(id)}`, calendarEventSchema);
}

export function createCalendarEvent(input: CalendarEventCreate) {
  return requestJson("/calendar-events", calendarEventSchema, {
    method: "POST",
    body: calendarEventCreateSchema.parse(input),
  });
}

export function updateCalendarEvent(id: string, input: CalendarEventUpdate) {
  return requestJson(`/calendar-events/${encodeURIComponent(id)}`, calendarEventSchema, {
    method: "PATCH",
    body: calendarEventUpdateSchema.parse(input),
  });
}

export function deleteCalendarEvent(id: string, version: number, mutationId: string) {
  return requestJson(`/calendar-events/${encodeURIComponent(id)}`, calendarEventSchema.nullable(), {
    method: "DELETE",
    body: calendarEventVersionSchema.parse({ version, mutationId }),
  });
}

export function setCalendarEventArchived(
  id: string,
  archived: boolean,
  version: number,
  mutationId: string,
) {
  return requestJson(
    `/calendar-events/${encodeURIComponent(id)}/${archived ? "archive" : "restore"}`,
    calendarEventSchema,
    {
      method: "POST",
      body: calendarEventVersionSchema.parse({ version, mutationId }),
    },
  );
}
