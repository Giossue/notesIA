import { render, screen, userEvent } from "@testing-library/react-native";
import { PaperProvider } from "react-native-paper";
import { FloatingNavBar } from "@/navigation/FloatingNavBar";

const mockReset = jest.fn();
const mockNavigate = jest.fn();

jest.mock("@react-native-vector-icons/material-design-icons", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ reset: mockReset, navigate: mockNavigate }),
}));
// La barra es una sola, fuera de las pantallas: cambia de pestaña con la referencia global.
jest.mock("@/navigation/navigation-ref", () => ({
  navigationRef: { reset: (...args: unknown[]) => mockReset(...args) },
}));

describe("FloatingNavBar", () => {
  beforeEach(() => {
    mockReset.mockClear();
    mockNavigate.mockClear();
  });

  test("shows all main destinations and navigates to another screen", async () => {
    await render(
      <PaperProvider>
        <FloatingNavBar active="Home" />
      </PaperProvider>,
    );

    for (const label of ["Inicio", "Agenda", "Progreso", "Perfil"]) {
      expect(screen.getByLabelText(`Ir a ${label}`)).toBeOnTheScreen();
    }
    expect(screen.queryByLabelText("Ir a Tareas")).toBeNull();
    expect(screen.getByLabelText("Crear")).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByLabelText("Ir a Agenda"));
    expect(mockReset).toHaveBeenCalledWith({
      index: 1,
      routes: [{ name: "Home" }, { name: "Agenda", params: { direction: "right" } }],
    });
    await user.press(screen.getByLabelText("Ir a Inicio"));
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  test("the center action opens real creation forms", async () => {
    await render(
      <PaperProvider>
        <FloatingNavBar active="Home" />
      </PaperProvider>,
    );

    const user = userEvent.setup();
    await user.press(screen.getByLabelText("Crear"));
    expect(await screen.findByLabelText("Nueva tarea")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Nueva materia")).toBeNull();
    expect(screen.queryByLabelText("Nuevo compromiso")).toBeNull();
    await user.press(screen.getByText("Nueva tarea", { includeHiddenElements: true }));
    expect(mockNavigate).toHaveBeenCalledWith("ActivityForm", {});
  });
});
