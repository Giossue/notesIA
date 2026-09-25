import { aiSuggestionResponseSchema, type Problem } from "@notesia/contracts";
import type { AiContextRepository } from "@notesia/db";
import type { Hono } from "hono";
import { z } from "zod";
import { aiCases, aiUseCaseSchema } from "./cases";
import type { AiGateway } from "./gateway";

type Dependencies = {
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
  gateway: AiGateway;
  context: AiContextRepository;
};

function error(status: 401 | 403 | 404 | 409 | 422, code: string, title: string) {
  const body: Problem = {
    type: `https://notesia.local/problems/${code.toLowerCase().replaceAll("_", "-")}`,
    title,
    status,
    code,
    requestId: crypto.randomUUID(),
  };
  return Response.json(body, { status, headers: { "Content-Type": "application/problem+json" } });
}

export function registerAiRoutes(app: Hono, dependencies: Dependencies) {
  app.post("/v1/ai/:useCase/suggestions", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const useCase = aiUseCaseSchema.safeParse(c.req.param("useCase"));
    if (!useCase.success) return error(422, "VALIDATION_FAILED", "Caso de uso inválido.");
    if (!c.req.header("content-type")?.toLowerCase().startsWith("application/json"))
      return error(422, "VALIDATION_FAILED", "Se requiere JSON.");
    const body: unknown = await c.req.json().catch(() => null);
    let payload: unknown = body;
    if (useCase.data === "explain_risk") {
      const ref = z.strictObject({ planId: z.uuid(), activityId: z.uuid() }).safeParse(body);
      if (!ref.success) return error(422, "VALIDATION_FAILED", "Datos inválidos.");
      const risk = await dependencies.context.risk(
        session.user.id,
        ref.data.planId,
        ref.data.activityId,
      );
      if (risk.kind === "not_found") return error(404, "NOT_FOUND", "Riesgo no encontrado.");
      if (risk.kind === "stale")
        return error(409, "VERSION_CONFLICT", "El riesgo cambió. Genera otra vista previa.");
      payload = risk.facts;
    } else if (useCase.data === "explain_replan") {
      const ref = z.strictObject({ planId: z.uuid() }).safeParse(body);
      if (!ref.success) return error(422, "VALIDATION_FAILED", "Datos inválidos.");
      payload = await dependencies.context.replan(session.user.id, ref.data.planId);
      if (!payload) return error(404, "NOT_FOUND", "Comparación no encontrada.");
    }
    if (!aiCases[useCase.data].input.safeParse(payload).success)
      return error(422, "VALIDATION_FAILED", "Datos inválidos.");
    const result = await dependencies.gateway.suggest(session.user.id, useCase.data, payload);
    if (result.kind === "consent_required")
      return error(403, "AI_CONSENT_REQUIRED", "Acepta el documento vigente de IA.");
    if (result.kind === "invalid_input") return error(422, "VALIDATION_FAILED", "Datos inválidos.");
    return c.json(aiSuggestionResponseSchema.parse(result));
  });
}
