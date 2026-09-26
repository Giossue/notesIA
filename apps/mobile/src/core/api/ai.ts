import {
  type AssistantMessage,
  assistantTurnRequestSchema,
  assistantTurnResponseSchema,
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
