import { render, screen, userEvent } from "@testing-library/react-native";
import { PaperProvider } from "react-native-paper";
import { Button } from "@/shared/paper";
import { ToastProvider, useToast } from "@/shared/Toast";

jest.mock("@react-native-vector-icons/material-design-icons", () => ({
  __esModule: true,
  default: () => null,
}));

function Trigger() {
  const toast = useToast();
  return <Button onPress={() => toast.show("No se pudo guardar la actividad.")}>Guardar</Button>;
}

test("el toast muestra el error y se puede cerrar", async () => {
  await render(
    <PaperProvider>
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    </PaperProvider>,
  );
  const user = userEvent.setup();
  await user.press(screen.getByText("Guardar"));
  expect(await screen.findByText("No se pudo guardar la actividad.")).toBeOnTheScreen();
  await user.press(screen.getByText("Cerrar"));
  expect(screen.queryByText("No se pudo guardar la actividad.")).toBeNull();
});
