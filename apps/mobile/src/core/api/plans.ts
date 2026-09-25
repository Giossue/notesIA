import {
  activePlanSchema,
  type PlanBlockEdit,
  type PlanPreview,
  planActionSchema,
  planBlockEditSchema,
  planHistoryPageSchema,
  planPreviewSchema,
  planSchema,
  riskAssessmentPageSchema,
} from "@notesia/contracts";
import { ApiError, requestJson } from "./client";

export function previewPlan(input: PlanPreview) {
  return requestJson("/plans/preview", planSchema, {
    method: "POST",
    body: planPreviewSchema.parse(input),
  });
}

export async function getActivePlan() {
  try {
    return await requestJson("/plans/active", activePlanSchema);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export function getPlan(id: string) {
  return requestJson(`/plans/${encodeURIComponent(id)}`, planSchema);
}

export function listPlanHistory(cursor?: string) {
  const query = new URLSearchParams();
  if (cursor) query.set("cursor", cursor);
  return requestJson(`/plans/history?${query.toString()}`, planHistoryPageSchema);
}

export function editPlanBlock(planId: string, blockId: string, input: PlanBlockEdit) {
  return requestJson(
    `/plans/${encodeURIComponent(planId)}/blocks/${encodeURIComponent(blockId)}`,
    planSchema,
    { method: "PATCH", body: planBlockEditSchema.parse(input) },
  );
}

export function removePlanBlock(planId: string, blockId: string, version: number) {
  return requestJson(
    `/plans/${encodeURIComponent(planId)}/blocks/${encodeURIComponent(blockId)}`,
    planSchema,
    { method: "DELETE", body: planActionSchema.parse({ version }) },
  );
}

export function actOnPlan(planId: string, version: number, action: "apply" | "reject") {
  return requestJson(`/plans/${encodeURIComponent(planId)}/${action}`, planSchema, {
    method: "POST",
    body: planActionSchema.parse({ version }),
  });
}

export function getRiskAssessment(from: string, through: string) {
  return requestJson(
    `/risk-assessments?${new URLSearchParams({ from, through }).toString()}`,
    riskAssessmentPageSchema,
  );
}
