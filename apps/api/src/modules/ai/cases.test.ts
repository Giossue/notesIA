import { expect, test } from "bun:test";
import { outputAgreesWithInput } from "./cases";

test("risk explanation cannot change the deterministic risk level", () => {
  const input = { level: "high", remainingMinutes: 120, availableMinutes: 60, deadlineHours: 12 };
  expect(
    outputAgreesWithInput("explain_risk", input, {
      level: "high",
      explanation: "La capacidad es insuficiente y el riesgo es alto.",
    }),
  ).toBe(true);
  expect(
    outputAgreesWithInput("explain_risk", input, {
      level: "low",
      explanation: "El riesgo es bajo.",
    }),
  ).toBe(false);
  expect(
    outputAgreesWithInput("explain_risk", input, {
      level: "high",
      explanation: "El riesgo es bajo.",
    }),
  ).toBe(false);
  expect(
    outputAgreesWithInput("explain_risk", input, {
      level: "high",
      explanation: "Tienes 500 horas disponibles.",
    }),
  ).toBe(false);
});

test("duration and replan prose cannot add numeric claims", () => {
  expect(
    outputAgreesWithInput(
      "estimate_duration",
      { description: "Leer" },
      { minutes: 30, reason: "La lectura requiere concentración." },
    ),
  ).toBe(true);
  expect(
    outputAgreesWithInput(
      "estimate_duration",
      { description: "Leer" },
      { minutes: 30, reason: "Tomará 90 minutos." },
    ),
  ).toBe(false);
  expect(
    outputAgreesWithInput(
      "explain_replan",
      {},
      { explanation: "Se movieron bloques para acomodar el trabajo." },
    ),
  ).toBe(true);
  expect(
    outputAgreesWithInput("explain_replan", {}, { explanation: "Se movieron 12 bloques." }),
  ).toBe(false);
});
