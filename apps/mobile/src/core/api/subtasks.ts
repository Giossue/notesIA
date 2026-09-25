import {
  type SubtaskCreate,
  type SubtaskUpdate,
  subtaskCreateSchema,
  subtaskPageSchema,
  subtaskSchema,
  subtaskUpdateSchema,
  subtaskVersionSchema,
} from "@notesia/contracts";
import { requestJson } from "./client";

function subtaskPath(activityId: string) {
  return `/activities/${encodeURIComponent(activityId)}/subtasks`;
}

export function listSubtasks(activityId: string, archived: boolean, cursor?: string) {
  const query = new URLSearchParams({ archived: String(archived) });
  if (cursor) query.set("cursor", cursor);
  return requestJson(`${subtaskPath(activityId)}?${query.toString()}`, subtaskPageSchema);
}

export function createSubtask(activityId: string, input: SubtaskCreate) {
  return requestJson(subtaskPath(activityId), subtaskSchema, {
    method: "POST",
    body: subtaskCreateSchema.parse(input),
  });
}

export function updateSubtask(activityId: string, id: string, input: SubtaskUpdate) {
  return requestJson(`${subtaskPath(activityId)}/${encodeURIComponent(id)}`, subtaskSchema, {
    method: "PATCH",
    body: subtaskUpdateSchema.parse(input),
  });
}

export function setSubtaskArchived(
  activityId: string,
  id: string,
  archived: boolean,
  version: number,
  mutationId: string,
) {
  return requestJson(
    `${subtaskPath(activityId)}/${encodeURIComponent(id)}/${archived ? "archive" : "restore"}`,
    subtaskSchema,
    {
      method: "POST",
      body: subtaskVersionSchema.parse({ version, mutationId }),
    },
  );
}
