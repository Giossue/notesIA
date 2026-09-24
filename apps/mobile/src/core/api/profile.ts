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
