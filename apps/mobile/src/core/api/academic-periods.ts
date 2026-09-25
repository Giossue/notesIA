import {
  type AcademicPeriodCreate,
  type AcademicPeriodUpdate,
  academicPeriodCreateSchema,
  academicPeriodPageSchema,
  academicPeriodSchema,
  academicPeriodUpdateSchema,
  subjectVersionSchema,
} from "@notesia/contracts";
import { requestJson } from "./client";

export function listAcademicPeriods(archived = false, cursor?: string) {
  const query = new URLSearchParams({ archived: String(archived) });
  if (cursor) query.set("cursor", cursor);
  return requestJson(`/academic-periods?${query.toString()}`, academicPeriodPageSchema);
}

export function getAcademicPeriod(id: string) {
  return requestJson(`/academic-periods/${encodeURIComponent(id)}`, academicPeriodSchema);
}

export function createAcademicPeriod(input: AcademicPeriodCreate) {
  return requestJson("/academic-periods", academicPeriodSchema, {
    method: "POST",
    body: academicPeriodCreateSchema.parse(input),
  });
}

export function updateAcademicPeriod(id: string, input: AcademicPeriodUpdate) {
  return requestJson(`/academic-periods/${encodeURIComponent(id)}`, academicPeriodSchema, {
    method: "PATCH",
    body: academicPeriodUpdateSchema.parse(input),
  });
}

export function setAcademicPeriodArchived(id: string, version: number, archived: boolean) {
  return requestJson(
    `/academic-periods/${encodeURIComponent(id)}/${archived ? "archive" : "restore"}`,
    academicPeriodSchema,
    { method: "POST", body: subjectVersionSchema.parse({ version }) },
  );
}
