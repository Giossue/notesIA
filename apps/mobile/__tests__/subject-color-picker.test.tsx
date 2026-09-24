import { render, screen, userEvent } from "@testing-library/react-native";
import { PaperProvider } from "react-native-paper";
import { darkTheme } from "@/core/theme/theme";
import { SubjectColorPicker } from "@/features/subjects/SubjectColorPicker";

jest.mock("@react-native-vector-icons/material-design-icons", () => ({
  __esModule: true,
  default: () => null,
}));

test("muestra los colores reales y permite elegir el acento", async () => {
  const onChange = jest.fn();
  await render(
    <PaperProvider theme={darkTheme}>
      <SubjectColorPicker value="primary" onChange={onChange} />
    </PaperProvider>,
  );

  expect(screen.getByTestId("subject-color-tertiary-swatch")).toHaveStyle({
    backgroundColor: darkTheme.colors.tertiary,
  });
  expect(screen.getByLabelText("Color Principal").props.accessibilityState).toMatchObject({
    selected: true,
  });
  await userEvent.setup().press(screen.getByLabelText("Color Acento"));
  expect(onChange).toHaveBeenCalledWith("tertiary");
});
