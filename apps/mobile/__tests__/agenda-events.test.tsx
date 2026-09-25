import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react-native";
import { PaperProvider } from "react-native-paper";
import { AgendaScreen } from "@/features/activities/AgendaScreen";

const mockNavigate = jest.fn();
jest.mock("@tanstack/react-query", () => ({ useInfiniteQuery: jest.fn(), useQuery: jest.fn() }));
jest.mock("@react-native-vector-icons/material-design-icons", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("@react-native-community/netinfo", () => ({ useNetInfo: () => ({ isConnected: true }) }));
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock("@/navigation/FloatingNavBar", () => ({ FloatingNavBar: () => null }));

const mockedInfiniteQuery = useInfiniteQuery as jest.Mock;
const mockedQuery = useQuery as jest.Mock;

test("la agenda muestra eventos y entregas del día en la zona horaria del perfil", async () => {
  jest.useFakeTimers({ now: new Date("2026-09-23T20:00:00.000Z") });
  mockedQuery.mockImplementation(({ queryKey }: { queryKey: string[] }) =>
    queryKey[0] === "profile"
      ? {
          data: { timeZone: "America/Guayaquil" },
          isPending: false,
          isError: false,
        }
      : { data: null, isPending: false, isError: false },
  );
  mockedInfiniteQuery.mockImplementation(({ queryKey }: { queryKey: string[] }) => ({
    data: {
      pages: [
        {
          items:
            queryKey[0] === "agenda-upcoming"
              ? []
              : queryKey[0] === "agenda-events"
                ? [
                    {
                      id: "event-1",
                      kind: "class",
                      description: null,
                      title: "Clase de cálculo",
                      startsAt: "2026-09-24T03:00:00.000Z",
                      endsAt: "2026-09-24T04:00:00.000Z",
                    },
                  ]
                : [
                    {
                      id: "activity-1",
                      progressPercent: 0,
                      title: "Entrega de informe",
                      deadlineAt: "2026-09-24T04:00:00.000Z",
                      status: "backlog",
                    },
                  ],
          nextCursor: null,
        },
      ],
    },
    isPending: false,
    isError: false,
    hasNextPage: false,
  }));

  await render(
    <PaperProvider>
      <AgendaScreen />
    </PaperProvider>,
  );

  expect(screen.getByText("CLASE")).toBeOnTheScreen();
  expect(screen.getByText("ENTREGA")).toBeOnTheScreen();
  expect(screen.getByText("Clase de cálculo")).toBeOnTheScreen();
  expect(screen.getByText("Entrega de informe")).toBeOnTheScreen();
  // Hora de inicio (y fin del evento) en la columna izquierda de la lista.
  expect(screen.getByText("22:00")).toBeOnTheScreen();
  expect(screen.getAllByText("23:00")).toHaveLength(2);
  jest.useRealTimers();
});
