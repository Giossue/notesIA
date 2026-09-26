import { streakSchema } from "@notesia/contracts";
import { requestJson } from "./client";

export function getStreak() {
  return requestJson("/streak", streakSchema);
}
