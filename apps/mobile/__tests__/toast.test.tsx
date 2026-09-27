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
  return <Button onPress={() => toast.show("No se pudo guardar la tarea.")}>Guardar</Button>;
}

test("el toast muestra el mensaje sin botón de cerrar", async () => {
  await render(
    <PaperProvider>
      <ToastProvider>
        <Trigger />
      </ToastProvider>
    </PaperProvider>,
  );
  const user = userEvent.setup();
  await user.press(screen.getByText("Guardar"));
  expect(await screen.findByText("No se pudo guardar la tarea.")).toBeOnTheScreen();
  // Se va solo a los pocos segundos: no hay botón de cerrar.
  expect(screen.queryByText("Cerrar")).toBeNull();
});
