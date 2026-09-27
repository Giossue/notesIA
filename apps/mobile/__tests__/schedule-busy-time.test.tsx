import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { PaperProvider } from "react-native-paper";
import { AvailabilityScreen } from "@/features/availability/AvailabilityScreen";

const mockNavigate = jest.fn();
jest.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: jest.fn(),
  useQuery: jest.fn(),
  useMutation: jest.fn(),
  useQueryClient: jest.fn(),
}));
jest.mock("@react-native-vector-icons/material-design-icons", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("@react-native-community/netinfo", () => ({ useNetInfo: () => ({ isConnected: true }) }));
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

beforeEach(() => {
  mockNavigate.mockClear();
  (useQuery as jest.Mock).mockImplementation(({ queryKey }: { queryKey: string[] }) =>
    queryKey[0] === "profile"
      ? { data: { timeZone: "America/Guayaquil" }, isPending: false, isError: false }
      : { isPending: true, isError: false },
  );
  (useInfiniteQuery as jest.Mock).mockReturnValue({
    data: {
      pages: [
        {
          items: [
            {
              id: "busy-1",
              kind: "class",
              title: "Clase de cálculo",
              startsAt: "2026-09-28T12:00:00Z",
              endsAt: "2026-09-28T14:00:00Z",
              timeZone: "America/Guayaquil",
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
});

test("Horario reúne las horas ocupadas existentes y permite agregar otra", async () => {
  await render(
    <PaperProvider>
      <AvailabilityScreen />
    </PaperProvider>,
  );

  expect(screen.getByText("Horas ocupadas")).toBeOnTheScreen();
  expect(screen.getByText("Clase de cálculo")).toBeOnTheScreen();
  expect(useInfiniteQuery).toHaveBeenCalledWith(
    expect.objectContaining({
      queryKey: expect.arrayContaining(["calendar-events", "upcoming"]),
      enabled: true,
    }),
  );
  await fireEvent.press(screen.getByLabelText("Abrir hora ocupada Clase de cálculo"));
  expect(mockNavigate).toHaveBeenCalledWith("EventForm", { id: "busy-1" });
  await fireEvent.press(screen.getByText("Agregar hora ocupada"));
  expect(mockNavigate).toHaveBeenCalledWith("EventForm", {});
});
