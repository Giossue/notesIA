import { render, screen } from "@testing-library/react-native";
import { PaperProvider } from "react-native-paper";
import { HomeHeader } from "@/features/home/HomeHeader";

test("el encabezado saluda con el nombre y la fecha", async () => {
  await render(
    <PaperProvider>
      <HomeHeader name="Josué" dateLabel="Lunes, 28 de abril" />
    </PaperProvider>,
  );

  expect(screen.getByText("Hola, Josué")).toBeOnTheScreen();
  expect(screen.getByText("Lunes, 28 de abril")).toBeOnTheScreen();
});
