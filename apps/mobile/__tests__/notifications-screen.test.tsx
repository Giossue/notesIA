import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { PaperProvider } from "react-native-paper";
import { NotificationsScreen } from "@/features/notifications/NotificationsScreen";
import { notificationTarget } from "@/features/notifications/notification-target";

const mockNavigate = jest.fn();
const mockMutate = jest.fn();
jest.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: jest.fn(),
  useMutation: jest.fn(),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock("@react-native-vector-icons/material-design-icons", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("@react-native-community/netinfo", () => ({ useNetInfo: () => ({ isConnected: true }) }));
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock("@/navigation/FloatingNavBar", () => ({ FloatingNavBar: () => null }));
jest.mock("@/core/api/notifications", () => ({}));

const base = {
  planId: null,
  reportId: null,
  activityId: null,
  blockId: null,
  referenceAt: null,
  version: 1,
  createdAt: "2026-09-26T15:00:00.000Z",
};

test("la lista muestra el texto de cada aviso, abre lo que avisa y tolera tipos nuevos", async () => {
  (useMutation as jest.Mock).mockReturnValue({ mutate: mockMutate, isPending: false });
  (useInfiniteQuery as jest.Mock).mockReturnValue({
    data: {
      pages: [
        {
          items: [
            {
              ...base,
              id: "a",
              type: "deadline_reminder",
              title: "Plazo próximo",
              body: "«Ensayo» vence hoy a las 18:00",
              activityId: "activity-1",
              readAt: null,
            },
            {
              ...base,
              id: "b",
              type: "announcement",
              title: "Mantenimiento",
              body: "Esta noche la app estará en pausa.",
              readAt: "2026-09-26T16:00:00.000Z",
            },
            {
              ...base,
              id: "c",
              type: "algo_que_esta_app_no_conoce",
              title: "Novedad",
              body: "Un aviso de una versión más nueva.",
              readAt: "2026-09-26T16:00:00.000Z",
            },
          ],
          nextCursor: null,
        },
      ],
    },
    isPending: false,
    isError: false,
    hasNextPage: false,
  });

  await render(
    <PaperProvider>
      <NotificationsScreen />
    </PaperProvider>,
  );

  expect(screen.getByText("«Ensayo» vence hoy a las 18:00")).toBeOnTheScreen();
  expect(screen.getByText("Esta noche la app estará en pausa.")).toBeOnTheScreen();
  expect(screen.getByText("Novedad")).toBeOnTheScreen();

  fireEvent.press(screen.getByText("Abrir tarea"));
  expect(mockNavigate).toHaveBeenCalledWith("ActivityForm", { id: "activity-1" });
  // Abrirlo lo marca como leído.
  expect(mockMutate).toHaveBeenCalledWith({ id: "a", version: 1 });

  fireEvent.press(screen.getByText("Marcar todas como leídas"));
  expect(mockMutate).toHaveBeenCalledTimes(2);
});

test("el push y la lista abren lo mismo", () => {
  expect(notificationTarget({ type: "streak_at_risk" })).toMatchObject({ screen: "Home" });
  expect(notificationTarget({ type: "report_updated", reportId: "r" })).toMatchObject({
    screen: "Reports",
  });
  expect(notificationTarget({ type: "plan_applied", planId: "p" })).toMatchObject({
    screen: "Agenda",
  });
  expect(notificationTarget({ type: "announcement" })).toBeNull();
});
