import {
  type SubtaskCreate,
  type SubtaskUpdate,
  subtaskCreateSchema,
  subtaskPageSchema,
  subtaskSchema,
  subtaskUpdateSchema,
  subtaskVersionSchema,
} from "@notesia/contracts";
import { v4 as uuidv4 } from "uuid";
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
  const body = subtaskCreateSchema.parse(input);
  return requestJson(subtaskPath(activityId), subtaskSchema, {
    method: "POST",
    body,
    queue: { id: body.id, entity: "subtask", operation: "create", entityId: body.id },
  });
}

export function updateSubtask(activityId: string, id: string, input: SubtaskUpdate) {
  const body = subtaskUpdateSchema.parse(input);
  return requestJson(`${subtaskPath(activityId)}/${encodeURIComponent(id)}`, subtaskSchema, {
    method: "PATCH",
    body,
    queue: {
      id: uuidv4(),
      entity: "subtask",
      operation: "update",
      entityId: id,
      baseVersion: body.version,
    },
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
      queue: {
        id: mutationId,
        entity: "subtask",
        operation: archived ? "delete" : "update",
        entityId: id,
        baseVersion: version,
      },
    },
  );
}
