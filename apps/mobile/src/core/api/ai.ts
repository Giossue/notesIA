import {
  type AssistantMessage,
  assistantActionStateUpdateSchema,
  assistantSessionSchema,
  assistantSuggestionsSchema,
  assistantTurnRequestSchema,
  assistantTurnResponseSchema,
  type OnboardingDraft,
  onboardingTurnRequestSchema,
  onboardingTurnResponseSchema,
} from "@notesia/contracts";
import { z } from "zod";
import { requestJson } from "./client";

/** Un mensaje al asistente; el servidor toma el historial de la sesión y lo guarda. */
export function sendAssistantMessage(message: string) {
  return requestJson("/ai/assistant/turns", assistantTurnResponseSchema, {
    method: "POST",
    body: assistantTurnRequestSchema.parse({ message }),
    timeoutMs: 70_000,
  });
}

/** La conversación activa, guardada en el servidor (el teléfono no la guarda). */
export function getAssistantSession() {
  return requestJson("/ai/assistant/session", assistantSessionSchema);
}

/** Cierra la conversación actual (ya no se muestra) y empieza una nueva. */
export function startAssistantSession() {
  return requestJson("/ai/assistant/session/new", assistantSessionSchema, { method: "POST" });
}

/** Qué hizo el estudiante con una propuesta: sirve para mejorar el asistente. */
export function reportAssistantAction(actionId: string, state: "applied" | "dismissed" | "failed") {
  return requestJson(`/ai/assistant/session/actions/${encodeURIComponent(actionId)}`, z.null(), {
    method: "PUT",
    body: assistantActionStateUpdateSchema.parse({ state }),
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

/** Tres sugerencias al azar para empezar a conversar; las gestiona el panel. */
export function getAssistantSuggestions() {
  return requestJson("/ai/assistant/suggestions", assistantSuggestionsSchema);
}
