import {
  addChatMessage,
  loadChat,
  resetAssistantChat,
  setMessagesLeft,
  updateChatAction,
  useChatMessages,
} from "@/core/assistant/chat-store";

// La conversación vive en el servidor; el teléfono solo la tiene en memoria.
let snapshot: ReturnType<typeof useChatMessages> = [];
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get(),
}));

beforeEach(() => resetAssistantChat());

test("muestra la sesión del servidor y la borra al cerrar sesión", () => {
  loadChat("s1", [{ id: "m1", role: "user", text: "Hola", actions: [] }], 29);
  snapshot = useChatMessages();
  expect(snapshot).toEqual([{ id: "m1", role: "user", text: "Hola", actions: [] }]);
  setMessagesLeft(0);
  resetAssistantChat();
  expect(useChatMessages()).toEqual([]);
});

test("las propuestas cambian de estado", () => {
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
  expect(useChatMessages()[0]?.actions[0]?.state).toBe("applied");
});
