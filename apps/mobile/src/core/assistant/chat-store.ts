import type { AssistantAction, AssistantMessage } from "@notesia/contracts";
import { useSyncExternalStore } from "react";

export type ActionState = "pending" | "applying" | "applied" | "dismissed" | "failed";
export type ChatAction = {
  id: string;
  action: AssistantAction;
  state: ActionState;
  error?: string;
};
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  actions: ChatAction[];
  /** Aviso en vez de respuesta: falta el consentimiento de IA o falló la solicitud. */
  notice?: "consent" | "error";
};

/**
 * Conversación del asistente: solo en memoria, mientras la app está abierta.
 * No se guarda en el servidor ni en el teléfono; se borra al cerrar sesión.
 */
let messages: ChatMessage[] = [];
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useChatMessages() {
  return useSyncExternalStore(subscribe, () => messages);
}

export function addChatMessage(message: ChatMessage) {
  messages = [...messages, message];
  emit();
}

export function updateChatAction(messageId: string, actionId: string, patch: Partial<ChatAction>) {
  messages = messages.map((message) =>
    message.id !== messageId
      ? message
      : {
          ...message,
          actions: message.actions.map((item) =>
            item.id === actionId ? { ...item, ...patch } : item,
          ),
        },
  );
  emit();
}

export function resetAssistantChat() {
  messages = [];
  emit();
}

/** Últimas intervenciones que se envían como contexto (sin avisos ni tarjetas). */
export function chatHistory(limit = 12): AssistantMessage[] {
  return messages
    .filter((message) => !message.notice && message.text.trim())
    .slice(-limit)
    .map((message) => ({ role: message.role, text: message.text.slice(0, 2000) }));
}
