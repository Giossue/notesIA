import {
  type ReportCreate,
  reportCreateSchema,
  reportListSchema,
  reportSchema,
} from "@notesia/contracts";
import { requestJson } from "./client";

export function listReports() {
  return requestJson("/reports", reportListSchema);
}

export function createReport(input: ReportCreate) {
  return requestJson("/reports", reportSchema, {
    method: "POST",
    body: reportCreateSchema.parse(input),
  });
}
