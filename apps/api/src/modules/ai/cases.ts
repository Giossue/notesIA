import { aiUseCaseSchema } from "@notesia/contracts";
import { z } from "zod";

const shortText = z.string().trim().min(1).max(2000);
const nonnegative = z.number().int().min(0).max(100000);

export const aiCases = {
  extract_activity: {
    version: 1,
    input: z.strictObject({ text: shortText }),
    output: z.strictObject({
      title: z.string().trim().min(1).max(160),
      description: z.string().trim().max(1000),
    }),
    jsonSchema: {
      type: "object",
      properties: { title: { type: "string" }, description: { type: "string" } },
      required: ["title", "description"],
      additionalProperties: false,
    },
    instruction:
      "Extrae una propuesta de actividad del texto. No inventes fechas ni apliques cambios. Devuelve JSON con título y descripción.",
  },
  estimate_duration: {
    version: 1,
    input: z.strictObject({ description: shortText }),
    output: z.strictObject({
      minutes: z.number().int().min(5).max(480),
      reason: z.string().trim().min(1).max(300),
    }),
    jsonSchema: {
      type: "object",
      properties: { minutes: { type: "integer" }, reason: { type: "string" } },
      required: ["minutes", "reason"],
      additionalProperties: false,
    },
    instruction:
      "Sugiere una duración en minutos entre 5 y 480, con razón breve. Es una sugerencia que requiere confirmación. Devuelve JSON.",
  },
  explain_risk: {
    version: 2,
    input: z.strictObject({
      level: z.enum(["low", "medium", "high"]),
      remainingMinutes: nonnegative,
      availableMinutes: nonnegative,
      deadlineHours: nonnegative,
    }),
    output: z.strictObject({
      level: z.enum(["low", "medium", "high"]),
      explanation: z.string().trim().min(1).max(500),
    }),
    jsonSchema: {
      type: "object",
      properties: {
        level: { type: "string", enum: ["low", "medium", "high"] },
        explanation: { type: "string" },
      },
      required: ["level", "explanation"],
      additionalProperties: false,
    },
    instruction:
      "Explica brevemente el riesgo calculado por el motor. Copia level sin cambiarlo. No uses cifras ni calcules nuevas métricas; no inventes causas. Devuelve JSON.",
  },
  explain_replan: {
    version: 2,
    input: z.strictObject({
      movedBlocks: nonnegative,
      addedBlocks: nonnegative,
      removedBlocks: nonnegative,
      unscheduledMinutes: nonnegative,
    }),
    output: z.strictObject({ explanation: z.string().trim().min(1).max(500) }),
    jsonSchema: {
      type: "object",
      properties: { explanation: { type: "string" } },
      required: ["explanation"],
      additionalProperties: false,
    },
    instruction:
      "Explica los cambios medidos entre dos planes sin usar cifras. No propongas aplicar el plan ni inventes motivos. Devuelve JSON.",
  },
  propose_subtasks: {
    version: 1,
    input: z.strictObject({ description: shortText }),
    output: z.strictObject({ subtasks: z.array(z.string().trim().min(1).max(160)).min(1).max(8) }),
    jsonSchema: {
      type: "object",
      properties: { subtasks: { type: "array", items: { type: "string" } } },
      required: ["subtasks"],
      additionalProperties: false,
    },
    instruction:
      "Propón hasta ocho subtareas concretas. Son borradores para revisión; no crees ni modifiques datos. Devuelve JSON.",
  },
} as const;

export type AiUseCase = keyof typeof aiCases;
export { aiUseCaseSchema };

export function redactInput(value: unknown): unknown {
  if (typeof value === "string")
    return value
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[correo]")
      .replace(/https?:\/\/\S+/gi, "[enlace]")
      .replace(/\+?\d[\d\s().-]{7,}\d/g, "[teléfono]");
  if (Array.isArray(value)) return value.map(redactInput);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactInput(item)]));
  return value;
}

export function outputAgreesWithInput(useCase: AiUseCase, input: unknown, output: unknown) {
  if (useCase === "explain_risk") {
    const source = aiCases.explain_risk.input.safeParse(input);
    const result = aiCases.explain_risk.output.safeParse(output);
    if (!source.success || !result.success || result.data.level !== source.data.level) return false;
    const explanation = result.data.explanation.toLowerCase();
    if (/\d/.test(explanation)) return false;
    const contradictory = {
      low: /\b(alto|alta|high|medio|media|moderado|moderada)\b/,
      medium: /\b(alto|alta|high|bajo|baja|low)\b/,
      high: /\b(bajo|baja|low|medio|media|moderado|moderada)\b|\b(sin riesgo|no hay riesgo)\b/,
    }[source.data.level];
    return !contradictory.test(explanation);
  }
  if (useCase === "explain_replan") {
    const result = aiCases.explain_replan.output.safeParse(output);
    return result.success && !/\d/.test(result.data.explanation);
  }
  if (useCase === "estimate_duration") {
    const result = aiCases.estimate_duration.output.safeParse(output);
    return result.success && !/\d/.test(result.data.reason);
  }
  return true;
}
