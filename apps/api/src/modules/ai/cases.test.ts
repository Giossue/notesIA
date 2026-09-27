import { expect, test } from "bun:test";
import { aiCases, outputAgreesWithInput } from "./cases";

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

/** Campos con varios tipos posibles (por ejemplo `["string", "null"]`) o `anyOf`. */
function unionParameters(schema: unknown): number {
  if (!schema || typeof schema !== "object") return 0;
  if (Array.isArray(schema)) return schema.reduce((sum, item) => sum + unionParameters(item), 0);
  const node = schema as Record<string, unknown>;
  const own = Array.isArray(node.type) || Array.isArray(node.anyOf) ? 1 : 0;
  return own + Object.values(node).reduce<number>((sum, value) => sum + unionParameters(value), 0);
}

// Anthropic rechaza con 400 los esquemas de salida con más de 16 campos de unión.
test("ningún esquema de salida supera el límite de Anthropic de 16 campos con unión", () => {
  for (const [name, spec] of Object.entries(aiCases)) {
    expect({ name, unions: unionParameters(spec.jsonSchema) <= 16 }).toEqual({
      name,
      unions: true,
    });
  }
});
