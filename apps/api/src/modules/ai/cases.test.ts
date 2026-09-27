import { expect, test } from "bun:test";
import { aiCases } from "./cases";

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
