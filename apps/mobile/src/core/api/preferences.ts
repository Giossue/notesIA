import { preferencesSchema, preferencesUpdateSchema } from "@notesia/contracts";
import { requestJson } from "./client";

export function getPreferences() {
  return requestJson("/me/preferences", preferencesSchema);
}

export function updatePreferences(input: unknown) {
  return requestJson("/me/preferences", preferencesSchema, {
    method: "PATCH",
    body: preferencesUpdateSchema.parse(input),
  });
}
