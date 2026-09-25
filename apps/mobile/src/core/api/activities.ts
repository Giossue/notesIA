import {
  type ActivityCreate,
  type ActivityUpdate,
  activityCreateSchema,
  activityDeleteSchema,
  activityHistoryPageSchema,
  activityPageSchema,
  activityProgressSchema,
  activitySchema,
  activityStatusSchema,
  activitySummarySchema,
  activityTransitionSchema,
  activityUpdateSchema,
  subjectVersionSchema,
} from "@notesia/contracts";
import { v4 as uuidv4 } from "uuid";
import { requestJson } from "./client";

export type ActivityFilter = {
  archived?: boolean;
  status?: string;
  dueOn?: string;
  dueFrom?: string;
  dueThrough?: string;
  cursor?: string;
};

export function listActivities(filter: ActivityFilter = {}) {
  const query = new URLSearchParams({
    archived: String(filter.archived ?? false),
  });
  if (filter.status) query.set("status", activityStatusSchema.parse(filter.status));
  if (filter.dueOn) query.set("dueOn", filter.dueOn);
  if (filter.dueFrom) query.set("dueFrom", filter.dueFrom);
  if (filter.dueThrough) query.set("dueThrough", filter.dueThrough);
  if (filter.cursor) query.set("cursor", filter.cursor);
  return requestJson(`/activities?${query.toString()}`, activityPageSchema);
}

export function getActivity(id: string) {
  return requestJson(`/activities/${encodeURIComponent(id)}`, activitySchema);
}

export function createActivity(input: ActivityCreate) {
  const body = activityCreateSchema.parse(input);
  return requestJson("/activities", activitySchema, {
    method: "POST",
    body,
    queue: {
      id: body.id,
      entity: "activity",
      operation: "create",
      entityId: body.id,
    },
  });
}

export function updateActivity(id: string, input: ActivityUpdate) {
  const body = activityUpdateSchema.parse(input);
  return requestJson(`/activities/${encodeURIComponent(id)}`, activitySchema, {
    method: "PATCH",
    body,
    queue: {
      id: uuidv4(),
      entity: "activity",
      operation: "update",
      entityId: id,
      baseVersion: body.version,
    },
  });
}

export function updateActivityProgress(
  id: string,
  version: number,
  mutationId: string,
  progressPercent: number,
) {
  const body = activityProgressSchema.parse({
    version,
    mutationId,
    progressPercent,
  });
  return requestJson(`/activities/${encodeURIComponent(id)}/progress`, activitySchema, {
    method: "PATCH",
    body,
    queue: {
      id: mutationId,
      entity: "progress",
      operation: "update",
      entityId: id,
      baseVersion: version,
    },
  });
}

export function deleteActivity(id: string, version: number, mutationId: string) {
  const body = activityDeleteSchema.parse({ version, mutationId });
  return requestJson(`/activities/${encodeURIComponent(id)}`, activitySchema.nullable(), {
    method: "DELETE",
    body,
    queue: {
      id: mutationId,
      entity: "activity",
      operation: "delete",
      entityId: id,
      baseVersion: version,
    },
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
  action: "complete" | "reopen" | "cancel",
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

export function getActivitySummary() {
  return requestJson("/activities/summary", activitySummarySchema);
}
