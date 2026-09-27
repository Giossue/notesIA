import {
  aiSuggestionResponseSchema,
  assistantActionStateUpdateSchema,
  assistantSessionSchema,
  assistantSuggestionsSchema,
  assistantTurnRequestSchema,
  assistantTurnResponseSchema,
  onboardingTurnRequestSchema,
  onboardingTurnResponseSchema,
  type Problem,
} from "@notesia/contracts";
import {
  type AiContextRepository,
  ASSISTANT_SESSION_LIMIT,
  type AssistantSessionRepository,
  type AssistantSessionRow,
  type AssistantSuggestionRepository,
} from "@notesia/db";
import type { Hono } from "hono";
import { z } from "zod";
import { runAssistantTurn } from "./assistant";
import { aiCases, aiUseCaseSchema } from "./cases";
import type { AiGateway } from "./gateway";
import { runOnboardingTurn } from "./onboarding";

type Dependencies = {
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
  gateway: AiGateway;
  context: AiContextRepository;
  /** Conversaciones guardadas en el servidor; sin esto, el chat no guarda nada. */
  sessions?: AssistantSessionRepository;
  suggestions?: AssistantSuggestionRepository;
};

type SessionEntry = AssistantSessionRow["content"][number];

function toSession(row: AssistantSessionRow) {
  return assistantSessionSchema.parse({
    id: row.id,
    messages: row.content.map((entry) => ({
      id: entry.id,
      role: entry.role,
      text: entry.text,
      actions: entry.actions ?? [],
      at: entry.at,
    })),
    messagesLeft: Math.max(0, ASSISTANT_SESSION_LIMIT - row.userMessages),
    limit: ASSISTANT_SESSION_LIMIT,
  });
}

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
  // Tres sugerencias al azar entre las activas, para empezar a conversar.
  const suggestions = dependencies.suggestions;
  if (suggestions)
    app.get("/v1/ai/assistant/suggestions", async (c) => {
      const session = await dependencies.getSession(c.req.raw.headers);
      if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
      return c.json(assistantSuggestionsSchema.parse({ items: await suggestions.random(3) }), 200, {
        "Cache-Control": "no-store",
      });
    });

  const sessions = dependencies.sessions;
  if (sessions) {
    // La conversación activa: la app la muestra al abrir el chat (no la guarda el teléfono).
    app.get("/v1/ai/assistant/session", async (c) => {
      const session = await dependencies.getSession(c.req.raw.headers);
      if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
      return c.json(toSession(await sessions.active(session.user.id)), 200, {
        "Cache-Control": "no-store",
      });
    });
    // Conversación nueva: la anterior se cierra y ya no se muestra (queda en el servidor).
    app.post("/v1/ai/assistant/session/new", async (c) => {
      const session = await dependencies.getSession(c.req.raw.headers);
      if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
      return c.json(toSession(await sessions.startNew(session.user.id)));
    });
    app.put("/v1/ai/assistant/session/actions/:actionId", async (c) => {
      const session = await dependencies.getSession(c.req.raw.headers);
      if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
      const actionId = z.uuid().safeParse(c.req.param("actionId"));
      const body = assistantActionStateUpdateSchema.safeParse(await c.req.json().catch(() => null));
      if (!actionId.success || !body.success)
        return error(422, "VALIDATION_FAILED", "Estado inválido.");
      const updated = await sessions.setActionState(
        session.user.id,
        actionId.data,
        body.data.state,
      );
      return updated ? c.body(null, 204) : error(404, "NOT_FOUND", "Propuesta no encontrada.");
    });
  }

  // Asistente conversacional: un mensaje por solicitud. El historial sale de la
  // sesión del servidor, donde se agrega el turno (hasta 30 mensajes por sesión).
  app.post("/v1/ai/assistant/turns", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    if (!c.req.header("content-type")?.toLowerCase().startsWith("application/json"))
      return error(422, "VALIDATION_FAILED", "Se requiere JSON.");
    const body = assistantTurnRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return error(422, "VALIDATION_FAILED", "Mensaje inválido.");
    const userId = session.user.id;
    const active = sessions ? await sessions.active(userId) : null;
    if (active && active.userMessages >= ASSISTANT_SESSION_LIMIT)
      return error(
        409,
        "SESSION_LIMIT",
        "Llegaste al límite de esta conversación. Empieza una nueva.",
      );
    const history = active
      ? active.content.slice(-12).map((entry) => ({
          role: entry.role,
          text: entry.text.slice(0, 2000),
        }))
      : (body.data.history ?? []);
    const result = await runAssistantTurn(dependencies, userId, {
      message: body.data.message,
      history,
    });
    if (result.kind === "consent_required")
      return error(403, "AI_CONSENT_REQUIRED", "Acepta el documento vigente de IA.");
    if (result.kind === "invalid_input")
      return error(422, "VALIDATION_FAILED", "Mensaje inválido.");
    if (result.kind !== "reply" || !sessions || !active)
      return c.json(assistantTurnResponseSchema.parse(result));
    const at = new Date().toISOString();
    const actionIds = result.actions.map(() => crypto.randomUUID());
    const entries: SessionEntry[] = [
      { id: crypto.randomUUID(), role: "user", text: body.data.message, at },
      {
        id: crypto.randomUUID(),
        role: "assistant",
        text: result.reply,
        actions: result.actions.map((action, index) => ({
          id: actionIds[index] as string,
          action,
          state: "pending" as const,
        })),
        at,
      },
    ];
    const used = await sessions.appendTurn(userId, active.id, entries);
    if (used === null)
      return error(
        409,
        "SESSION_LIMIT",
        "Llegaste al límite de esta conversación. Empieza una nueva.",
      );
    return c.json(
      assistantTurnResponseSchema.parse({
        ...result,
        actionIds,
        messagesLeft: Math.max(0, ASSISTANT_SESSION_LIMIT - used),
      }),
    );
  });

  // Configuración inicial conversada: arma la semana; la app la guarda al confirmar.
  app.post("/v1/ai/onboarding/turns", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    if (!c.req.header("content-type")?.toLowerCase().startsWith("application/json"))
      return error(422, "VALIDATION_FAILED", "Se requiere JSON.");
    const body = onboardingTurnRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return error(422, "VALIDATION_FAILED", "Mensaje inválido.");
    const result = await runOnboardingTurn(dependencies, session.user.id, body.data);
    if (result.kind === "consent_required")
      return error(403, "AI_CONSENT_REQUIRED", "Acepta el documento vigente de IA.");
    if (result.kind === "invalid_input")
      return error(422, "VALIDATION_FAILED", "Mensaje inválido.");
    return c.json(onboardingTurnResponseSchema.parse(result));
  });

  app.post("/v1/ai/:useCase/suggestions", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const useCase = aiUseCaseSchema.safeParse(c.req.param("useCase"));
    // El chat tiene su propia ruta, que controla la conversación y las consultas.
    if (
      !useCase.success ||
      useCase.data === "assistant_chat" ||
      useCase.data === "onboarding_setup"
    )
      return error(422, "VALIDATION_FAILED", "Caso de uso inválido.");
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
