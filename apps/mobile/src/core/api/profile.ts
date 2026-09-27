import { type ProfileUpdate, profileSchema, profileUpdateSchema } from "@notesia/contracts";
import { requestJson } from "./client";

export function getProfile() {
  return requestJson("/me", profileSchema);
}

export function updateProfile(input: ProfileUpdate) {
  return requestJson("/me/profile", profileSchema, {
    method: "PATCH",
    body: profileUpdateSchema.parse(input),
  });
}

/** Termina la configuración inicial (franja de estudio y horas ocupadas). */
export function completeOnboarding() {
  return requestJson("/me/onboarding/complete", profileSchema, { method: "POST" });
}
