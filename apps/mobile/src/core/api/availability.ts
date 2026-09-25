import {
  type AvailabilityExceptionWrite,
  type AvailabilityRuleCreate,
  type AvailabilityRuleUpdate,
  availabilityCapacitySchema,
  availabilityExceptionListSchema,
  availabilityExceptionSchema,
  availabilityExceptionWriteSchema,
  availabilityRuleCreateSchema,
  availabilityRuleListSchema,
  availabilityRuleSchema,
  availabilityRuleUpdateSchema,
  subjectVersionSchema,
} from "@notesia/contracts";
import { requestJson } from "./client";

export function listAvailabilityRules() {
  return requestJson("/availability-rules", availabilityRuleListSchema);
}

export function createAvailabilityRule(input: AvailabilityRuleCreate) {
  return requestJson("/availability-rules", availabilityRuleSchema, {
    method: "POST",
    body: availabilityRuleCreateSchema.parse(input),
  });
}

export function updateAvailabilityRule(id: string, input: AvailabilityRuleUpdate) {
  return requestJson(`/availability-rules/${encodeURIComponent(id)}`, availabilityRuleSchema, {
    method: "PATCH",
    body: availabilityRuleUpdateSchema.parse(input),
  });
}

export function setAvailabilityRuleArchived(id: string, version: number, archived: boolean) {
  return requestJson(
    `/availability-rules/${encodeURIComponent(id)}/${archived ? "archive" : "restore"}`,
    availabilityRuleSchema,
    { method: "POST", body: subjectVersionSchema.parse({ version }) },
  );
}

export function listAvailabilityExceptions(from: string, through: string) {
  return requestJson(
    `/availability-exceptions?${new URLSearchParams({ from, through }).toString()}`,
    availabilityExceptionListSchema,
  );
}

export function replaceAvailabilityException(date: string, input: AvailabilityExceptionWrite) {
  return requestJson(
    `/availability-exceptions/${encodeURIComponent(date)}`,
    availabilityExceptionSchema,
    {
      method: "PUT",
      body: availabilityExceptionWriteSchema.parse(input),
    },
  );
}

export function getAvailabilityCapacity(from: string, through: string) {
  return requestJson(
    `/availability/capacity?${new URLSearchParams({ from, through }).toString()}`,
    availabilityCapacitySchema,
  );
}
