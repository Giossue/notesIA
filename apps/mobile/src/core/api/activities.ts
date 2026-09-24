import {
  type ActivityCreate,
  type ActivityUpdate,
  activityCreateSchema,
  activityHistoryPageSchema,
  activityPageSchema,
  activitySchema,
  activityStatusSchema,
  activityTransitionSchema,
  activityUpdateSchema,
  subjectVersionSchema,
} from "@notesia/contracts";
import { requestJson } from "./client";

export type ActivityFilter = {
  archived?: boolean;
  status?: string;
  dueOn?: string;
  cursor?: string;
};

export function listActivities(filter: ActivityFilter = {}) {
  const query = new URLSearchParams({ archived: String(filter.archived ?? false) });
  if (filter.status) query.set("status", activityStatusSchema.parse(filter.status));
  if (filter.dueOn) query.set("dueOn", filter.dueOn);
  if (filter.cursor) query.set("cursor", filter.cursor);
  return requestJson(`/activities?${query.toString()}`, activityPageSchema);
}

export function getActivity(id: string) {
  return requestJson(`/activities/${encodeURIComponent(id)}`, activitySchema);
}

export function createActivity(input: ActivityCreate) {
  return requestJson("/activities", activitySchema, {
    method: "POST",
    body: activityCreateSchema.parse(input),
  });
}

export function updateActivity(id: string, input: ActivityUpdate) {
  return requestJson(`/activities/${encodeURIComponent(id)}`, activitySchema, {
    method: "PATCH",
    body: activityUpdateSchema.parse(input),
  });
}

export function setActivityArchived(id: string, version: number, archived: boolean) {
  return requestJson(
    `/activities/${encodeURIComponent(id)}/${archived ? "archive" : "restore"}`,
    activitySchema,
    { method: "POST", body: subjectVersionSchema.parse({ version }) },
  );
}

export function transitionActivity(
  id: string,
  version: number,
  mutationId: string,
  action: "complete" | "reopen",
) {
  return requestJson(`/activities/${encodeURIComponent(id)}/${action}`, activitySchema, {
    method: "POST",
    body: activityTransitionSchema.parse({ version, mutationId }),
  });
}

export function listActivityHistory(id: string, cursor?: string) {
  const query = new URLSearchParams();
  if (cursor) query.set("cursor", cursor);
  return requestJson(
    `/activities/${encodeURIComponent(id)}/history?${query.toString()}`,
    activityHistoryPageSchema,
  );
}
