import {
  addChatMessage,
  chatHistory,
  resetAssistantChat,
  updateChatAction,
} from "@/core/assistant/chat-store";

beforeEach(() => resetAssistantChat());

test("el historial enviado al asistente omite avisos y respeta el límite", () => {
  for (let index = 0; index < 8; index++) {
    addChatMessage({ id: `u${index}`, role: "user", text: `mensaje ${index}`, actions: [] });
    addChatMessage({ id: `a${index}`, role: "assistant", text: `respuesta ${index}`, actions: [] });
  }
  addChatMessage({
    id: "error",
    role: "assistant",
    text: "El servicio de IA no responde",
    actions: [],
    notice: "error",
  });
  const history = chatHistory();
  expect(history).toHaveLength(12);
  expect(history.at(-1)).toEqual({ role: "assistant", text: "respuesta 7" });
  expect(history.some((item) => item.text.includes("no responde"))).toBe(false);
});

test("las propuestas cambian de estado y la conversación se borra al cerrar sesión", () => {
  addChatMessage({
    id: "m1",
    role: "assistant",
    text: "Te propongo esto",
    actions: [
      {
        id: "p1",
        state: "pending",
        action: {
          type: "delete_activity",
          activityId: "8f7c1c6e-6f6e-4b53-9a7e-0f5a4b8b9a11",
          title: "Deber",
        },
      },
    ],
  });
  updateChatAction("m1", "p1", { state: "applied" });
  expect(chatHistory()).toEqual([{ role: "assistant", text: "Te propongo esto" }]);
  resetAssistantChat();
  expect(chatHistory()).toEqual([]);
});
