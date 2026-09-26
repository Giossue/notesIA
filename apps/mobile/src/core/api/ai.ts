import {
  type AssistantMessage,
  assistantTurnRequestSchema,
  assistantTurnResponseSchema,
  type OnboardingDraft,
  onboardingTurnRequestSchema,
  onboardingTurnResponseSchema,
} from "@notesia/contracts";
import { requestJson } from "./client";

/** Un mensaje al asistente con el historial reciente; puede hacer dos llamadas a la IA. */
export function sendAssistantMessage(message: string, history: AssistantMessage[]) {
  return requestJson("/ai/assistant/turns", assistantTurnResponseSchema, {
    method: "POST",
    body: assistantTurnRequestSchema.parse({ message, history }),
    timeoutMs: 70_000,
  });
}

/** Un mensaje del agente de configuración inicial, con el borrador de la semana. */
export function sendOnboardingMessage(
  message: string,
  history: AssistantMessage[],
  draft: OnboardingDraft,
) {
  return requestJson("/ai/onboarding/turns", onboardingTurnResponseSchema, {
    method: "POST",
    body: onboardingTurnRequestSchema.parse({ message, history, draft }),
    timeoutMs: 60_000,
  });
}
