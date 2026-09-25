import { appendRecognizedText } from "./dictation";

test("el dictado conserva el texto escrito y limpia espacios de los extremos", () => {
  expect(appendRecognizedText("Preparar informe", " para el viernes ")).toBe(
    "Preparar informe para el viernes",
  );
  expect(appendRecognizedText("", " Resolver cálculo ")).toBe("Resolver cálculo");
});
