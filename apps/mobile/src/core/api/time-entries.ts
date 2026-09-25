import {
  activeTimeEntrySchema,
  timeEntryManualSchema,
  timeEntryPageSchema,
  timeEntrySchema,
  timeEntryStartSchema,
  timeEntryStopSchema,
  timeStatisticsSchema,
} from "@notesia/contracts";
import { requestJson } from "./client";

export function listTimeEntries(cursor?: string) {
  const query = new URLSearchParams();
  if (cursor) query.set("cursor", cursor);
  return requestJson(`/time-entries?${query.toString()}`, timeEntryPageSchema);
}

export function getActiveTimeEntry() {
  return requestJson("/time-entries/active", activeTimeEntrySchema);
}

export function startTimeEntry(id: string, activityId: string) {
  return requestJson("/time-entries/start", timeEntrySchema, {
    method: "POST",
    body: timeEntryStartSchema.parse({ id, activityId }),
  });
}

export function stopTimeEntry(id: string, version: number, mutationId: string) {
  return requestJson(`/time-entries/${encodeURIComponent(id)}/stop`, timeEntrySchema, {
    method: "POST",
    body: timeEntryStopSchema.parse({ version, mutationId }),
  });
}

export function addManualTimeEntry(input: unknown) {
  const body = timeEntryManualSchema.parse(input);
  return requestJson("/time-entries/manual", timeEntrySchema, {
    method: "POST",
    body,
    queue: {
      id: body.id,
      entity: "time_entry",
      operation: "create",
      entityId: body.id,
    },
  });
}

export function getTimeStatistics(from: string, through: string) {
  return requestJson(
    `/time-entries/statistics?${new URLSearchParams({ from, through }).toString()}`,
    timeStatisticsSchema,
  );
}
