import {
  type SubjectCreate,
  type SubjectUpdate,
  subjectCreateSchema,
  subjectPageSchema,
  subjectSchema,
  subjectUpdateSchema,
  subjectVersionSchema,
} from "@notesia/contracts";
import { requestJson } from "./client";

export function listSubjects(archived: boolean, cursor?: string) {
  const query = new URLSearchParams({ archived: String(archived) });
  if (cursor) query.set("cursor", cursor);
  return requestJson(`/subjects?${query.toString()}`, subjectPageSchema);
}

export function getSubject(id: string) {
  return requestJson(`/subjects/${encodeURIComponent(id)}`, subjectSchema);
}

export function createSubject(input: SubjectCreate) {
  return requestJson("/subjects", subjectSchema, {
    method: "POST",
    body: subjectCreateSchema.parse(input),
  });
}

export function updateSubject(id: string, input: SubjectUpdate) {
  return requestJson(`/subjects/${encodeURIComponent(id)}`, subjectSchema, {
    method: "PATCH",
    body: subjectUpdateSchema.parse(input),
  });
}

export function setSubjectArchived(id: string, version: number, archived: boolean) {
  return requestJson(
    `/subjects/${encodeURIComponent(id)}/${archived ? "archive" : "restore"}`,
    subjectSchema,
    {
      method: "POST",
      body: subjectVersionSchema.parse({ version }),
    },
  );
}
