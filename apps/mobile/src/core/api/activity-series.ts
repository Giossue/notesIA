import {
  type ActivitySeriesCreate,
  activitySeriesCreateSchema,
  activitySeriesPageSchema,
  activitySeriesSchema,
} from "@notesia/contracts";
import { requestJson } from "./client";

export function listActivitySeries(cursor?: string) {
  const query = new URLSearchParams();
  if (cursor) query.set("cursor", cursor);
  return requestJson(`/activity-series?${query.toString()}`, activitySeriesPageSchema);
}

export function getActivitySeries(id: string) {
  return requestJson(`/activity-series/${encodeURIComponent(id)}`, activitySeriesSchema);
}

export function createActivitySeries(input: ActivitySeriesCreate) {
  return requestJson("/activity-series", activitySeriesSchema, {
    method: "POST",
    body: activitySeriesCreateSchema.parse(input),
  });
}
