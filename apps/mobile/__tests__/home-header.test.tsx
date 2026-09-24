import { render, screen, userEvent } from "@testing-library/react-native";
import { PaperProvider } from "react-native-paper";
import { HomeHeader } from "@/features/home/HomeHeader";

jest.mock("@react-native-vector-icons/material-design-icons", () => ({
  __esModule: true,
  default: () => null,
}));

test("el perfil se abre desde el encabezado y las notificaciones no prometen una función inexistente", async () => {
  const openProfile = jest.fn();
  await render(
    <PaperProvider>
      <HomeHeader name="Josué" greeting="Buenos días" onOpenProfile={openProfile} />
    </PaperProvider>,
  );

  expect(screen.getByText("Josué")).toBeOnTheScreen();
  expect(screen.getByLabelText("Notificaciones aún no disponibles")).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByLabelText("Abrir perfil"));
  expect(openProfile).toHaveBeenCalledTimes(1);
});
