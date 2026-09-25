import { render, screen, userEvent } from "@testing-library/react-native";
import { PaperProvider } from "react-native-paper";
import { HomeHeader } from "@/features/home/HomeHeader";

jest.mock("@react-native-vector-icons/material-design-icons", () => ({
  __esModule: true,
  default: () => null,
}));

test("el perfil y las notificaciones se abren desde el encabezado", async () => {
  const openProfile = jest.fn();
  const openNotifications = jest.fn();
  await render(
    <PaperProvider>
      <HomeHeader
        name="Josué"
        greeting="Buenos días"
        onOpenProfile={openProfile}
        onOpenNotifications={openNotifications}
      />
    </PaperProvider>,
  );

  expect(screen.getByText("Josué")).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByLabelText("Abrir perfil"));
  expect(openProfile).toHaveBeenCalledTimes(1);
  await userEvent.setup().press(screen.getByLabelText("Abrir notificaciones"));
  expect(openNotifications).toHaveBeenCalledTimes(1);
});
