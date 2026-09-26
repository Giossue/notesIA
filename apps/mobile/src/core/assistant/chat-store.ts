import type { AssistantAction } from "@notesia/contracts";
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
  /** Aviso en vez de respuesta: falló la solicitud. */
  notice?: "error";
};

/**
 * Conversación del asistente: solo en memoria, mientras la app está abierta.
 * No se guarda en el servidor ni en el teléfono; se borra al cerrar sesión.
 */
let messages: ChatMessage[] = [];
/** Sesión del servidor que se está mostrando y cuántos mensajes le quedan. */
let session: { id: string | null; messagesLeft: number | null } = { id: null, messagesLeft: null };
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

export function useChatSession() {
  return useSyncExternalStore(subscribe, () => session);
}

/** Muestra la conversación que devolvió el servidor. */
export function loadChat(id: string, loaded: ChatMessage[], messagesLeft: number) {
  messages = loaded;
  session = { id, messagesLeft };
  emit();
}

export function setMessagesLeft(messagesLeft: number) {
  session = { ...session, messagesLeft };
  emit();
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
  session = { id: null, messagesLeft: null };
  emit();
}
