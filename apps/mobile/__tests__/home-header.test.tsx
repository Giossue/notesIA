import { useQuery } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react-native";
import { PaperProvider } from "react-native-paper";
import { HomeHeader } from "@/features/home/HomeHeader";

jest.mock("@tanstack/react-query", () => ({ useQuery: jest.fn() }));
jest.mock("@react-navigation/native", () => ({ useNavigation: () => ({ navigate: jest.fn() }) }));
jest.mock("@/core/api/notifications", () => ({ unreadNotificationCount: jest.fn() }));
jest.mock("@/core/api/profile", () => ({ getProfile: jest.fn() }));

test("el encabezado saluda con el nombre, la fecha y avisa si hay notificaciones sin leer", async () => {
  (useQuery as jest.Mock).mockReturnValue({ data: { count: 2 }, refetch: jest.fn() });
  await render(
    <PaperProvider>
      <HomeHeader name="Josué" dateLabel="Lunes, 28 de abril" />
    </PaperProvider>,
  );

  expect(screen.getByText("Hola, Josué")).toBeOnTheScreen();
  expect(screen.getByText("Lunes, 28 de abril")).toBeOnTheScreen();
  expect(screen.getByLabelText("Notificaciones, hay avisos sin leer")).toBeOnTheScreen();
  expect(screen.getByLabelText("Ir a tu perfil")).toBeOnTheScreen();
});
