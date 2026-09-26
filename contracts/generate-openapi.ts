import { writeFileSync } from "node:fs";
import { join } from "node:path";
import * as contracts from "@notesia/contracts";
import YAML from "yaml";
import { z } from "zod";
import { createApp } from "../apps/api/src/app";
import { supportedAuthRoutes } from "../apps/api/src/auth/supported-routes";
import { aiCases } from "../apps/api/src/modules/ai/cases";

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
type Definition = {
  method: Method;
  path: string;
  response?: string;
  request?: string;
  statuses?: number[];
  emptyStatuses?: number[];
  description?: string;
};

const provider = z.object({
  id: z.uuid(),
  provider: contracts.aiProviderSchema,
  enabled: z.boolean(),
  keyConfigured: z.boolean(),
  updatedAt: z.iso.datetime(),
});
const routeAlternate = z.object({
  provider: contracts.aiProviderSchema,
  modelId: z.string(),
  timeoutMs: z.number().int(),
  maxOutputTokens: z.number().int(),
  inputPriceUsdPerMillion: z.string(),
  outputPriceUsdPerMillion: z.string(),
});
const route = z.object({
  useCase: contracts.aiUseCaseSchema,
  provider: contracts.aiProviderSchema,
  modelId: z.string(),
  timeoutMs: z.number().int(),
  maxOutputTokens: z.number().int(),
  dailyBudgetTokens: z.number().int(),
  inputPriceUsdPerMillion: z.string().nullable(),
  outputPriceUsdPerMillion: z.string().nullable(),
  enabled: z.boolean(),
  alternate: routeAlternate.nullable(),
});
const suggestion = z.union([
  z.strictObject({
    kind: z.literal("manual"),
    reason: z.enum([
      "not_configured",
      "rate_limited",
      "budget_exhausted",
      "invalid_output",
      "provider_unavailable",
    ]),
  }),
  ...Object.entries(aiCases).map(([useCase, spec]) =>
    z.strictObject({
      kind: z.literal("suggestion"),
      useCase: z.literal(useCase),
      value: spec.output,
      source: z.literal("ai"),
      requiresConfirmation: z.literal(true),
      promptVersion: z.number().int().positive(),
    }),
  ),
]);
const customSchemas: Record<string, z.ZodType> = {
  aiProviderList: z.array(provider),
  aiProviderSaved: provider.omit({ updatedAt: true }),
  aiRouteList: z.array(route),
  aiRouteSaved: route
    .omit({ inputPriceUsdPerMillion: true, outputPriceUsdPerMillion: true })
    .extend({
      inputPriceUsdPerMillion: z.string(),
      outputPriceUsdPerMillion: z.string(),
    }),
  aiConnectionTest: z.object({ ok: z.literal(true) }),
  adminRoleSaved: z.object({
    userId: z.uuid(),
    role: z.enum(["admin", "support"]),
    version: z.number().int().positive(),
  }),
  adminRoleRemoved: z.object({ userId: z.uuid(), removed: z.literal(true) }),
  pushDeviceSaved: z.object({
    id: z.uuid(),
    platform: z.enum(["android", "ios"]),
    registered: z.literal(true),
  }),
  deletionStatusOrNull: contracts.accountDeletionStatusSchema.nullable(),
  aiSuggestion: suggestion,
  aiSuggestionRequest: z.union([
    aiCases.extract_activity.input,
    aiCases.estimate_duration.input,
    z.strictObject({ planId: z.uuid(), activityId: z.uuid() }),
    z.strictObject({ planId: z.uuid() }),
    aiCases.propose_subtasks.input,
  ]),
  authCredentials: z.object({ email: z.email(), password: z.string() }),
  authRegistration: z.object({ name: z.string(), email: z.email(), password: z.string().min(12) }),
  authRegistered: z
    .object({
      token: z.null(),
      user: z
        .object({ id: z.uuid(), email: z.email(), emailVerified: z.literal(false) })
        .passthrough(),
    })
    .passthrough(),
  authSession: z
    .object({
      user: z.object({ id: z.uuid(), email: z.email() }).passthrough(),
      session: z.object({ id: z.string() }).passthrough(),
    })
    .passthrough()
    .nullable(),
  authSignedIn: z
    .object({ token: z.string().optional(), user: z.object({ id: z.uuid() }).passthrough() })
    .passthrough(),
  authSignInOutcome: z.union([
    z
      .object({ token: z.string().optional(), user: z.object({ id: z.uuid() }).passthrough() })
      .passthrough(),
    z.object({ twoFactorRedirect: z.literal(true) }).passthrough(),
  ]),
  authSignedOut: z.object({ success: z.boolean() }).passthrough(),
  authRecoveryRequest: z.object({ email: z.email() }),
  authRecoveryRequested: z.object({ status: z.boolean(), message: z.string() }),
  authVerificationRequest: z.object({ email: z.email() }),
  authVerificationRequested: z.object({ status: z.literal(true) }),
  authVerificationDone: z.object({ status: z.literal(true), user: z.null() }),
  authResetRequest: z.object({ token: z.string(), newPassword: z.string().min(12) }),
  authResetDone: z.object({ status: z.boolean() }),
  authTotpEnrollment: z.object({ password: z.string(), method: z.literal("totp") }),
  authTotpSetup: z.object({
    method: z.literal("totp"),
    totpURI: z.string(),
    backupCodes: z.array(z.string()),
  }),
  authTotpVerification: z.object({
    code: z.string().meta({ writeOnly: true }),
    trustDevice: z.literal(false),
  }),
  authTotpVerified: z.object({ status: z.boolean() }).passthrough(),
  authTotpDisable: z.object({ password: z.string() }),
  authTotpDisabled: z.object({ status: z.literal(true) }),
  authBackupVerification: z.object({
    code: z.string().meta({ writeOnly: true }),
    trustDevice: z.literal(false).optional(),
  }),
  authBackupRegeneration: z.object({ password: z.string() }),
  authBackupCodes: z.object({ status: z.literal(true), backupCodes: z.array(z.string()) }),
};

const entries: Definition[] = [];
const add = (
  method: Method,
  path: string,
  response?: string,
  request?: string,
  statuses?: number[],
  description?: string,
) => entries.push({ method, path, response, request, statuses, description });

add("GET", "/v1/health", "healthSchema");
add("GET", "/v1/ready", "readinessSchema");
add("GET", "/v1/me", "profileSchema");
add("PATCH", "/v1/me/profile", "profileSchema", "profileUpdateSchema");
add("GET", "/v1/me/preferences", "preferencesSchema");
add("PATCH", "/v1/me/preferences", "preferencesSchema", "preferencesUpdateSchema");
add("POST", "/v1/me/export", "accountExport", "accountExportRequestSchema");
add("GET", "/v1/me/deletion-request", "deletionStatusOrNull");
add(
  "POST",
  "/v1/me/deletion-request",
  "accountDeletionStatusSchema",
  "accountDeletionRequestSchema",
  [202],
);
add("DELETE", "/v1/me/deletion-request", undefined, "accountDeletionCancelSchema", [204]);
add("GET", "/v1/me/push-devices", "pushDeviceListSchema");
add("POST", "/v1/me/push-devices", "pushDeviceSaved", "pushDeviceRegisterSchema");
add("DELETE", "/v1/me/push-devices/:id", undefined, undefined, [204]);

add("GET", "/v1/activities", "activityPageSchema");
add("GET", "/v1/activities/summary", "activitySummarySchema");
add("GET", "/v1/activities/:id", "activitySchema");
add("GET", "/v1/activities/:id/history", "activityHistoryPageSchema");
add("POST", "/v1/activities", "activitySchema", "activityCreateSchema", [200, 201]);
add("PATCH", "/v1/activities/:id", "activitySchema", "activityUpdateSchema");
add("DELETE", "/v1/activities/:id", undefined, "activityDeleteSchema", [204]);
for (const action of ["archive", "restore"])
  add("POST", `/v1/activities/:id/${action}`, "activitySchema", "versionSchema");
for (const action of ["complete", "reopen", "cancel", "start", "pause"])
  add("POST", `/v1/activities/:id/${action}`, "activitySchema", "activityTransitionSchema");
add("PATCH", "/v1/activities/:id/progress", "activitySchema", "activityProgressSchema");
add("GET", "/v1/activity-series", "activitySeriesPageSchema");
add("GET", "/v1/activity-series/:id", "activitySeriesSchema");
add(
  "POST",
  "/v1/activity-series",
  "activitySeriesSchema",
  "activitySeriesCreateSchema",
  [200, 201],
);

add("GET", "/v1/activities/:activityId/subtasks", "subtaskPageSchema");
add("GET", "/v1/activities/:activityId/subtasks/:subtaskId", "subtaskSchema");
add(
  "POST",
  "/v1/activities/:activityId/subtasks",
  "subtaskSchema",
  "subtaskCreateSchema",
  [200, 201],
);
add(
  "PATCH",
  "/v1/activities/:activityId/subtasks/:subtaskId",
  "subtaskSchema",
  "subtaskUpdateSchema",
);
for (const action of ["archive", "restore"])
  add(
    "POST",
    `/v1/activities/:activityId/subtasks/:subtaskId/${action}`,
    "subtaskSchema",
    "subtaskVersionSchema",
  );

add("GET", "/v1/calendar-events", "calendarEventPageSchema");
add("GET", "/v1/calendar-events/:id", "calendarEventSchema");
add("POST", "/v1/calendar-events", "calendarEventSchema", "calendarEventCreateSchema", [200, 201]);
add("PATCH", "/v1/calendar-events/:id", "calendarEventSchema", "calendarEventUpdateSchema");
add("GET", "/v1/streak", "streakSchema");
add("DELETE", "/v1/calendar-events/:id", undefined, "calendarEventVersionSchema", [204]);
for (const action of ["archive", "restore"])
  add(
    "POST",
    `/v1/calendar-events/:id/${action}`,
    "calendarEventSchema",
    "calendarEventVersionSchema",
  );

add("GET", "/v1/availability-rules", "availabilityRuleListSchema");
add(
  "POST",
  "/v1/availability-rules",
  "availabilityRuleSchema",
  "availabilityRuleCreateSchema",
  [200, 201],
);
add(
  "PATCH",
  "/v1/availability-rules/:id",
  "availabilityRuleSchema",
  "availabilityRuleUpdateSchema",
);
for (const action of ["archive", "restore"])
  add("POST", `/v1/availability-rules/:id/${action}`, "availabilityRuleSchema", "versionSchema");
add("GET", "/v1/availability-exceptions", "availabilityExceptionListSchema");
add(
  "PUT",
  "/v1/availability-exceptions/:date",
  "availabilityExceptionSchema",
  "availabilityExceptionWriteSchema",
  [200, 201],
);
add("GET", "/v1/availability/capacity", "availabilityCapacitySchema");

add("POST", "/v1/plans/preview", "planSchema", "planPreviewSchema", [200, 201]);
add("GET", "/v1/risk-assessments", "riskAssessmentPageSchema");
add("GET", "/v1/plans/active", "activePlanSchema");
add("GET", "/v1/plans/history", "planHistoryPageSchema");
add("GET", "/v1/plans/:id", "planSchema");
add("PATCH", "/v1/plans/:id/blocks/:blockId", "planSchema", "planBlockEditSchema");
add("DELETE", "/v1/plans/:id/blocks/:blockId", "planSchema", "planActionSchema");
for (const action of ["apply", "reject"])
  add("POST", `/v1/plans/:id/${action}`, "planSchema", "planActionSchema");

add("GET", "/v1/time-entries", "timeEntryPageSchema");
add("GET", "/v1/time-entries/active", "activeTimeEntrySchema");
add("GET", "/v1/time-entries/statistics", "timeStatisticsSchema");
add("POST", "/v1/time-entries/start", "timeEntrySchema", "timeEntryStartSchema", [200, 201]);
add("POST", "/v1/time-entries/:id/stop", "timeEntrySchema", "timeEntryStopSchema");
add("POST", "/v1/time-entries/manual", "timeEntrySchema", "timeEntryManualSchema", [200, 201]);

add("GET", "/v1/me/notification-preferences", "notificationPreferencesSchema");
add(
  "PATCH",
  "/v1/me/notification-preferences",
  "notificationPreferencesSchema",
  "notificationPreferencesUpdateSchema",
);
add("GET", "/v1/notifications", "notificationPageSchema");
add("POST", "/v1/notifications/:id/read", "notificationSchema", "versionSchema");
add("GET", "/v1/privacy/documents", "privacyDocumentListSchema");
add("GET", "/v1/me/consents", "consentListSchema");
add("POST", "/v1/me/consents", "consentRecordSchema", "consentAcceptSchema");
add("POST", "/v1/me/consents/ai/revoke", "consentRecordSchema", undefined, [200, 204]);

add("GET", "/v1/admin/system-health", "adminSystemHealthSchema");
add("GET", "/v1/admin/ai/usage", "adminAiUsageSchema");
add("GET", "/v1/admin/ai/providers", "aiProviderList");
add("PUT", "/v1/admin/ai/providers/:provider", "aiProviderSaved", "adminAiProviderUpdateSchema");
add("GET", "/v1/admin/ai/routes", "aiRouteList");
add("PUT", "/v1/admin/ai/routes/:useCase", "aiRouteSaved", "adminAiRouteUpdateSchema");
add("POST", "/v1/admin/ai/routes/:useCase/test", "aiConnectionTest");
add("GET", "/v1/admin/users", "adminUserPageSchema");
add(
  "PUT",
  "/v1/admin/users/:userId/suspension",
  "adminUserStateSchema",
  "adminUserSuspensionSchema",
);
add("GET", "/v1/admin/roles", "adminRolePageSchema");
add("PUT", "/v1/admin/roles/:userId", "adminRoleSaved", "adminRoleUpdateSchema");
add("DELETE", "/v1/admin/roles/:userId", "adminRoleRemoved", "adminRoleRemoveSchema");
add("GET", "/v1/admin/privacy-documents", "adminDocumentPageSchema");
add(
  "POST",
  "/v1/admin/privacy-documents",
  "adminDocumentSchema",
  "adminDocumentCreateSchema",
  [201],
);
add("POST", "/v1/admin/privacy-documents/:id/publish", "adminDocumentSchema", "adminPublishSchema");
add("GET", "/v1/admin/audit", "adminAuditPageSchema");
add(
  "POST",
  "/v1/ai/:useCase/suggestions",
  "aiSuggestion",
  "aiSuggestionRequest",
  undefined,
  "El cuerpo depende del caso de uso. Riesgo y replanificación aceptan IDs propios; la IA nunca altera el plan.",
);
add(
  "POST",
  "/v1/ai/assistant/turns",
  "assistantTurnResponseSchema",
  "assistantTurnRequestSchema",
  undefined,
  "Asistente conversacional: un mensaje con el historial reciente. Responde texto y propuestas de cambio que la app aplica solo si el estudiante confirma.",
);

// Better Auth owns these endpoints; the app only exposes these flows.
// They are separate from the explicit Hono route inventory below.
const delegatedEntries: Definition[] = [
  {
    method: "GET",
    path: "/v1/auth/get-session",
    response: "authSession",
    description: "Devuelve la sesión actual o null.",
  },
  {
    method: "POST",
    path: "/v1/auth/sign-up/email",
    response: "authRegistered",
    request: "authRegistration",
    description:
      "Crea una cuenta pendiente y envía su verificación. No crea una sesión; el correo debe verificarse antes de usar la aplicación.",
  },
  {
    method: "POST",
    path: "/v1/auth/sign-in/email",
    response: "authSignInOutcome",
    request: "authCredentials",
    description:
      "Con TOTP activo devuelve twoFactorRedirect y una cookie de desafío; después se verifica el código.",
  },
  { method: "POST", path: "/v1/auth/sign-out", response: "authSignedOut" },
  {
    method: "POST",
    path: "/v1/auth/send-verification-email",
    response: "authVerificationRequested",
    request: "authVerificationRequest",
    description:
      "Reenvía la verificación con una respuesta indistinguible para cuentas inexistentes, pendientes o ya verificadas.",
  },
  {
    method: "GET",
    path: "/v1/auth/verify-email",
    response: "authVerificationDone",
    statuses: [200, 302],
    emptyStatuses: [302],
    description:
      "Verifica el token. Los enlaces emitidos por el servidor redirigen a notesia://email-verified y no crean una sesión.",
  },
  {
    method: "POST",
    path: "/v1/auth/request-password-reset",
    response: "authRecoveryRequested",
    request: "authRecoveryRequest",
    description:
      "Disponible con recuperación configurada. Responde igual para cuentas existentes e inexistentes.",
  },
  {
    method: "POST",
    path: "/v1/auth/reset-password",
    response: "authResetDone",
    request: "authResetRequest",
  },
  {
    method: "POST",
    path: "/v1/auth/two-factor/enable",
    response: "authTotpSetup",
    request: "authTotpEnrollment",
    description: "Inicia TOTP; la URI y los códigos de respaldo se entregan una sola vez.",
  },
  {
    method: "POST",
    path: "/v1/auth/two-factor/disable",
    response: "authTotpDisabled",
    request: "authTotpDisable",
    description:
      "Desactiva TOTP con contraseña y rota la sesión. Un administrador pierde acceso hasta volver a activarlo y verificarlo.",
  },
  {
    method: "POST",
    path: "/v1/auth/two-factor/verify-totp",
    response: "authTotpVerified",
    request: "authTotpVerification",
    description: "Confirma TOTP y rota la sesión.",
  },
  {
    method: "POST",
    path: "/v1/auth/two-factor/verify-backup-code",
    response: "authSignedIn",
    request: "authBackupVerification",
    description: "Consume un código de respaldo una sola vez y completa el desafío TOTP.",
  },
  {
    method: "POST",
    path: "/v1/auth/two-factor/generate-backup-codes",
    response: "authBackupCodes",
    request: "authBackupRegeneration",
    description:
      "Reemplaza todos los códigos anteriores; los nuevos códigos se muestran una sola vez.",
  },
];

const dummy = new Proxy({}, { get: () => () => {} });
const app = createApp(
  async () => {},
  async () => new Response(),
  ...Array(18).fill(dummy),
);
const actual = new Set(
  app.routes
    .filter((item) => item.method !== "ALL" && item.path.startsWith("/v1/"))
    .map((item) => `${item.method} ${item.path}`),
);
const expected = new Set(entries.map((item) => `${item.method} ${item.path}`));
const missing = [...actual].filter((item) => !expected.has(item));
const obsolete = [...expected].filter((item) => !actual.has(item));
if (missing.length || obsolete.length || expected.size !== entries.length)
  throw new Error(
    `OpenAPI inventory differs from runtime routes: missing ${missing.join(", ")}; obsolete ${obsolete.join(", ")}`,
  );
const exposedAuth = new Set(supportedAuthRoutes.map(({ method, path }) => `${method} ${path}`));
const documentedAuth = new Set(delegatedEntries.map(({ method, path }) => `${method} ${path}`));
if (
  exposedAuth.size !== supportedAuthRoutes.length ||
  documentedAuth.size !== delegatedEntries.length ||
  [...exposedAuth].some((route) => !documentedAuth.has(route)) ||
  [...documentedAuth].some((route) => !exposedAuth.has(route))
)
  throw new Error("OpenAPI authentication routes differ from the API allowlist");

const parameterName = (path: string, name: string) =>
  name !== "id"
    ? name
    : ({
        activities: "activityId",
        "activity-series": "seriesId",
        "calendar-events": "eventId",
        "availability-rules": "ruleId",
        plans: "planId",
        "time-entries": "entryId",
        notifications: "notificationId",
        "push-devices": "deviceId",
        "privacy-documents": "documentId",
      }[
        path.includes("/push-devices/")
          ? "push-devices"
          : path.includes("/privacy-documents/")
            ? "privacy-documents"
            : (path.split("/")[2] ?? "")
      ] ?? "id");
const dateQuery = (name: string, required = false) => ({
  in: "query",
  name,
  required,
  schema: { type: "string", format: "date" },
});
const cursorQuery = () => ({
  in: "query",
  name: "cursor",
  schema: { type: "string", maxLength: 256 },
});
const archivedQuery = () => ({ in: "query", name: "archived", schema: { type: "boolean" } });
const rangeQuery = () => [dateQuery("from", true), dateQuery("through", true)];
const queries: Record<string, object[]> = {
  "/activities": [
    archivedQuery(),
    cursorQuery(),
    {
      in: "query",
      name: "status",
      schema: {
        type: "string",
        enum: ["backlog", "planned", "in_progress", "completed", "cancelled"],
      },
    },
    { in: "query", name: "seriesId", schema: { type: "string", format: "uuid" } },
    dateQuery("dueOn"),
    dateQuery("dueFrom"),
    dateQuery("dueThrough"),
  ],
  "/activities/{activityId}/history": [cursorQuery()],
  "/activities/{activityId}/subtasks": [archivedQuery(), cursorQuery()],
  "/activity-series": [cursorQuery()],
  "/calendar-events": [
    archivedQuery(),
    cursorQuery(),
    dateQuery("on"),
    ...rangeQuery().map((item) => ({ ...item, required: false })),
  ],
  "/availability-exceptions": rangeQuery(),
  "/availability/capacity": rangeQuery(),
  "/risk-assessments": rangeQuery(),
  "/plans/history": [cursorQuery()],
  "/time-entries": [cursorQuery()],
  "/time-entries/statistics": rangeQuery(),
  "/notifications": [cursorQuery()],
  "/privacy/documents": [
    {
      in: "query",
      name: "language",
      schema: { type: "string", enum: ["es", "en"], default: "es" },
    },
  ],
  "/auth/verify-email": [
    {
      in: "query",
      name: "token",
      required: true,
      description: "Token de verificación de un solo uso.",
      schema: { type: "string", minLength: 1 },
    },
    {
      in: "query",
      name: "callbackURL",
      required: false,
      description: "Retorno fijo a la aplicación móvil.",
      schema: { type: "string", const: "notesia://email-verified" },
    },
  ],
  "/admin/ai/usage": rangeQuery(),
  "/admin/users": [cursorQuery()],
  "/admin/roles": [cursorQuery()],
  "/admin/privacy-documents": [cursorQuery()],
  "/admin/audit": [cursorQuery()],
};

const components: Record<string, object> = {
  AccountExport: {
    type: "object",
    required: ["format", "generatedAt", "data"],
    properties: {
      format: { type: "string", const: "notesia-export-v1" },
      generatedAt: { type: "string", format: "date-time" },
      data: {
        type: "object",
        description: "Cada sección de datos personales es un arreglo, incluso si está vacía.",
        additionalProperties: { type: "array", items: { type: "object" } },
      },
    },
  },
};
function annotateRequestSecrets(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) annotateRequestSecrets(item);
    return;
  }
  const schema = value as Record<string, unknown>;
  if (schema.properties && typeof schema.properties === "object") {
    for (const [name, property] of Object.entries(schema.properties)) {
      if (
        ["password", "newPassword", "apiKey", "token"].includes(name) &&
        property &&
        typeof property === "object"
      )
        (property as Record<string, unknown>).writeOnly = true;
    }
  }
  for (const nested of Object.values(schema)) annotateRequestSecrets(nested);
}
function schemaRef(name: string, input = false) {
  const key = `${name[0].toUpperCase()}${name.slice(1).replace(/Schema$/, "")}${input ? "Input" : ""}`;
  if (!components[key]) {
    const value = customSchemas[name] ?? (contracts as Record<string, unknown>)[name];
    if (!value || typeof value !== "object" || !("safeParse" in value))
      throw new Error(`Missing Zod schema ${name}`);
    const json = z.toJSONSchema(value as z.ZodType, input ? { io: "input" } : undefined);
    delete json.$schema;
    if (input) annotateRequestSecrets(json);
    components[key] = json;
  }
  return { $ref: `#/components/schemas/${key}` };
}

const paths: Record<string, Record<string, unknown>> = {};
function pascal(value: string) {
  return value
    .split("-")
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join("");
}
for (const item of [...entries, ...delegatedEntries]) {
  const path = item.path
    .slice(3)
    .replace(/:([^/]+)/g, (_, name: string) => `{${parameterName(item.path, name)}}`);
  const params = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => ({
    in: "path",
    name: match[1],
    required: true,
    schema:
      match[1] === "provider"
        ? { type: "string", enum: ["openai", "anthropic", "deepseek"] }
        : match[1] === "useCase"
          ? { type: "string", enum: Object.keys(aiCases) }
          : { type: "string", format: match[1] === "date" ? "date" : "uuid" },
  }));
  const statuses = item.statuses ?? [200];
  const responses: Record<string, object> = Object.fromEntries(
    statuses.map((status) => [
      String(status),
      {
        description: status === 204 ? "Sin contenido" : "Respuesta correcta",
        ...(item.response && status !== 204 && !item.emptyStatuses?.includes(status)
          ? { content: { "application/json": { schema: schemaRef(item.response) } } }
          : {}),
      },
    ]),
  );
  responses.default = {
    description: "Error",
    content: { "application/problem+json": { schema: schemaRef("problemSchema") } },
  };
  const method = item.method.toLowerCase();
  const operation: Record<string, unknown> = {
    operationId: `${method}${path
      .split("/")
      .filter(Boolean)
      .map((part) =>
        part.startsWith("{") ? `By${part[1].toUpperCase()}${part.slice(2, -1)}` : pascal(part),
      )
      .join("")}`,
    ...(item.description ? { description: item.description } : {}),
    ...(item.path === "/v1/health" ||
    item.path === "/v1/ready" ||
    item.path === "/v1/privacy/documents" ||
    [
      "/v1/auth/get-session",
      "/v1/auth/sign-up/email",
      "/v1/auth/sign-in/email",
      "/v1/auth/send-verification-email",
      "/v1/auth/verify-email",
      "/v1/auth/request-password-reset",
      "/v1/auth/reset-password",
    ].includes(item.path)
      ? { security: [] }
      : {}),
    ...(params.length ||
    queries[path] ||
    (item.method !== "GET" &&
      !item.path.startsWith("/v1/auth/") &&
      !item.path.startsWith("/v1/admin/") &&
      !item.path.startsWith("/v1/ai/") &&
      !item.path.startsWith("/v1/me/consents") &&
      !["/v1/me/export", "/v1/me/deletion-request"].includes(item.path))
      ? {
          parameters: [
            ...params,
            ...(item.method === "GET" ? (queries[path] ?? []) : []),
            ...(item.method !== "GET" &&
            !item.path.startsWith("/v1/auth/") &&
            !item.path.startsWith("/v1/admin/") &&
            !item.path.startsWith("/v1/ai/") &&
            !item.path.startsWith("/v1/me/consents") &&
            !["/v1/me/export", "/v1/me/deletion-request"].includes(item.path)
              ? [
                  {
                    in: "header",
                    name: "Idempotency-Key",
                    required: false,
                    schema: { type: "string", format: "uuid" },
                  },
                ]
              : []),
          ],
        }
      : {}),
    ...(item.request
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: schemaRef(item.request, true) } },
          },
        }
      : {}),
    responses,
  };
  if (!paths[path]) paths[path] = {};
  paths[path][method] = operation;
}

const spec = {
  openapi: "3.1.0",
  info: {
    title: "Student Planner API",
    version: "0.1.0",
    description:
      "Contrato de /v1 generado desde las rutas Hono y los validadores Zod. Incluye las operaciones de Better Auth expuestas por la aplicación. Las restricciones entre campos se aplican además en el servidor.",
  },
  servers: [{ url: "https://api.example.com/v1" }],
  security: [{ cookieAuth: [] }, { secureCookieAuth: [] }],
  paths: Object.fromEntries(Object.entries(paths).sort(([a], [b]) => a.localeCompare(b))),
  components: {
    securitySchemes: {
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "better-auth.session_token",
        description: "Nombre de la cookie en desarrollo local sin HTTPS.",
      },
      secureCookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "__Secure-better-auth.session_token",
        description: "Nombre de la cookie en producción con HTTPS.",
      },
    },
    schemas: Object.fromEntries(Object.entries(components).sort(([a], [b]) => a.localeCompare(b))),
  },
};

const operationIds = new Set<string>();
for (const [path, methods] of Object.entries(paths)) {
  for (const operation of Object.values(methods)) {
    const value = operation as {
      operationId: string;
      parameters?: Array<{ in: string; name: string }>;
    };
    if (operationIds.has(value.operationId))
      throw new Error(`Duplicate OpenAPI operationId ${value.operationId}`);
    operationIds.add(value.operationId);
    const placeholders = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).sort();
    const parameters = (value.parameters ?? [])
      .filter((parameter) => parameter.in === "path")
      .map((parameter) => parameter.name)
      .sort();
    if (JSON.stringify(placeholders) !== JSON.stringify(parameters))
      throw new Error(`OpenAPI path parameters differ for ${path}`);
  }
}

const output = join(import.meta.dir, "openapi.yaml");
const rendered = YAML.stringify(spec, { lineWidth: 0 });
if (process.argv.includes("--check")) {
  const existing = await Bun.file(output).text();
  if (existing !== rendered)
    throw new Error("contracts/openapi.yaml is stale; run bun run contracts:generate");
} else if (process.argv.includes("--stdout")) {
  process.stdout.write(rendered);
} else {
  writeFileSync(output, rendered);
  console.log(
    `Wrote OpenAPI for ${entries.length} registered operations and ${delegatedEntries.length} delegated auth flows`,
  );
}
