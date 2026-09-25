import { useQuery } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react-native";
import { PaperProvider } from "react-native-paper";
import { ProgressScreen } from "@/features/progress/ProgressScreen";

jest.mock("@tanstack/react-query", () => ({ useQuery: jest.fn() }));
jest.mock("@react-native-vector-icons/material-design-icons", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("@react-native-community/netinfo", () => ({ useNetInfo: () => ({ isConnected: true }) }));
jest.mock("@react-navigation/native", () => ({ useNavigation: () => ({ navigate: jest.fn() }) }));
jest.mock("@/navigation/FloatingNavBar", () => ({ FloatingNavBar: () => null }));

const days = ["21", "22", "23", "24", "25", "26", "27"].map((day, index) => ({
  date: `2026-09-${day}`,
  completed: index === 2 ? 3 : 0,
  due: index === 2 ? 4 : 1,
}));

test("estadísticas muestra el avance semanal, los tipos de actividad y la racha", async () => {
  (useQuery as jest.Mock).mockReturnValue({
    data: {
      day: "2026-09-23",
      dueToday: 1,
      pending: 4,
      inProgress: 1,
      overdue: 0,
      week: { from: "2026-09-21", through: "2026-09-28", due: 10, completedDue: 7, days },
      categories: [
        { category: "academic", total: 10, completed: 7 },
        { category: "personal", total: 2, completed: 1 },
        { category: "daily", total: 0, completed: 0 },
      ],
      streakDays: 3,
    },
    isPending: false,
    isError: false,
  });

  await render(
    <PaperProvider>
      <ProgressScreen />
    </PaperProvider>,
  );

  expect(screen.getAllByText("70%").length).toBeGreaterThan(0);
  expect(screen.getByText("21 – 27 sep")).toBeOnTheScreen();
  expect(screen.getByText("7 de 10 entregas de la semana")).toBeOnTheScreen();
  // Leyenda de los anillos y tarjeta del tipo.
  expect(screen.getAllByText("Académica")).toHaveLength(2);
  expect(screen.getByText("7 de 10")).toBeOnTheScreen();
  expect(screen.getByText("Cotidiana")).toBeOnTheScreen();
  expect(screen.getByText("Racha de 3 días")).toBeOnTheScreen();
  expect(screen.getByLabelText("Mié: 3 completadas de 4 con plazo")).toBeOnTheScreen();
});
