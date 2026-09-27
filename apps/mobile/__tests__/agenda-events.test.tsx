import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
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

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

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
});

test("permite elegir mes y año, conserva el día posible y vuelve a hoy", async () => {
  jest.useFakeTimers({ now: new Date("2026-12-31T20:00:00.000Z") });
  mockedQuery.mockImplementation(({ queryKey }: { queryKey: string[] }) =>
    queryKey[0] === "profile"
      ? { data: { timeZone: "America/Guayaquil" }, isPending: false, isError: false }
      : { data: null, isPending: false, isError: false },
  );
  mockedInfiniteQuery.mockReturnValue({
    data: { pages: [{ items: [], nextCursor: null }] },
    isPending: false,
    isError: false,
    hasNextPage: false,
  });

  await render(
    <PaperProvider>
      <AgendaScreen />
    </PaperProvider>,
  );

  await fireEvent.press(screen.getByLabelText("Elegir mes y año, actual Diciembre 2026"));
  expect(screen.getByText("Elegir mes y año")).toBeOnTheScreen();
  await fireEvent.press(screen.getByLabelText("Elegir año, actual 2026"));
  await fireEvent.press(screen.getByLabelText("Elegir año 2027"));
  await fireEvent.press(screen.getByLabelText("Febrero de 2027"));

  expect(screen.getByText("Febrero 2027")).toBeOnTheScreen();
  expect(screen.getByLabelText("Dom 28").props.accessibilityState).toMatchObject({
    selected: true,
  });
  expect(mockedInfiniteQuery).toHaveBeenCalledWith(
    expect.objectContaining({ queryKey: ["agenda", "week", "2027-02-22", "2027-03-01"] }),
  );

  await fireEvent.press(screen.getByLabelText("Semana siguiente"));
  expect(screen.getByText("Marzo 2027")).toBeOnTheScreen();
  expect(screen.getByLabelText("Dom 7").props.accessibilityState).toMatchObject({ selected: true });

  await fireEvent.press(screen.getByText("Volver a hoy"));
  expect(screen.getByText("Diciembre 2026")).toBeOnTheScreen();
  expect(screen.getByLabelText("Jue 31").props.accessibilityState).toMatchObject({
    selected: true,
  });

  await fireEvent.press(screen.getByLabelText("Elegir mes y año, actual Diciembre 2026"));
  await fireEvent.press(screen.getByLabelText("Elegir año, actual 2026"));
  await fireEvent.press(screen.getByLabelText("Años siguientes"));
  await fireEvent.press(screen.getByLabelText("Elegir año 2030"));
  await fireEvent.press(screen.getByLabelText("Junio de 2030"));
  expect(screen.getByText("Junio 2030")).toBeOnTheScreen();
});
