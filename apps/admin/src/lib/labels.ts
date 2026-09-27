import type { AdminAiUsage, AdminSystemHealth } from "@notesia/contracts";

/**
 * Nombres en español de los valores internos que muestra el panel. La API y
 * la base usan identificadores en inglés; los administradores solo ven esto.
 */
export const providerLabels = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  deepseek: "DeepSeek",
} as const;

export const useCaseLabels = {
  extract_activity: "Extraer tarea de un texto",
  estimate_duration: "Estimar duración",
  explain_risk: "Explicar riesgo de atraso",
  explain_replan: "Explicar replanificación",
  propose_subtasks: "Proponer subtareas",
  assistant_chat: "Asistente conversacional",
  onboarding_setup: "Configuración inicial",
} as const;

export const queueLabels: Record<keyof AdminSystemHealth["queues"], string> = {
  outbox: "Eventos internos",
  push: "Notificaciones push",
  recoveryMail: "Correos de recuperación",
  verificationMail: "Correos de verificación",
};

export const roleLabels: Record<string, string> = {
  admin: "Administrador",
  support: "Soporte",
};
export const roleLabel = (role: string | null | undefined) =>
  role ? (roleLabels[role] ?? role) : "Estudiante";

export const auditActionLabels: Record<string, string> = {
  "privacy_document.created": "Documento legal creado",
  "privacy_document.published": "Documento legal publicado",
  "ai_provider.updated": "Conexión de IA actualizada",
  "ai_route.updated": "Ruta de IA actualizada",
  "ai_route.tested": "Ruta de IA probada",
  "role.assigned": "Rol asignado",
  "role.changed": "Rol cambiado",
  "role.removed": "Rol quitado",
  "account.suspended": "Cuenta suspendida",
  "assistant_suggestion.created": "Sugerencia del asistente creada",
  "assistant_suggestion.updated": "Sugerencia del asistente editada",
  "assistant_suggestion.deleted": "Sugerencia del asistente eliminada",
  "account.reactivated": "Cuenta reactivada",
};

export const usageStatusLabels: Record<AdminAiUsage["items"][number]["status"], string> = {
  reserved: "En curso",
  success: "Correcta",
  error: "Con error",
  invalid: "Respuesta no válida",
  timeout: "Tiempo agotado",
  unknown: "Desconocido",
};

export const fallbackReasonLabels: Record<string, string> = {
  not_configured: "sin configurar",
  rate_limited: "límite de solicitudes",
  budget_exhausted: "presupuesto agotado",
  invalid_output: "respuesta no válida",
  provider_unavailable: "proveedor no disponible",
};

export const label = <T extends Record<string, string>>(labels: T, value: string) =>
  (labels as Record<string, string>)[value] ?? value;
