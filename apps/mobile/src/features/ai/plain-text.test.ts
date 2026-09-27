import { expect, test } from "bun:test";
import { plainText } from "./plain-text";

test("limpia el markdown y deja listas con viñetas", () => {
  expect(
    plainText("## Esta semana\n\n**Tienes 3 tareas:**\n- Ensayo\n* Examen\n\n\n\n1) Leer"),
  ).toBe("Esta semana\n\nTienes 3 tareas:\n• Ensayo\n• Examen\n\n1. Leer");
});
