import { z } from "zod";
import { avatarIds } from "./avatars.generated";

export { avatarIds, defaultAvatarId } from "./avatars.generated";

export const healthSchema = z.object({ status: z.literal("ok") });

export const readinessSchema = z.object({
  status: z.literal("ok"),
  database: z.literal("ready"),
});

export type Readiness = z.infer<typeof readinessSchema>;

export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  detail: z.string().optional(),
  requestId: z.string(),
});

export type Problem = z.infer<typeof problemSchema>;

export const timeZoneSchema = z
  .string()
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Zona horaria inválida.");

/** Avatar del perfil: uno de los SVG incluidos en la app. */
export const avatarIdSchema = z.enum(avatarIds);
export type AvatarId = z.infer<typeof avatarIdSchema>;

export const profileUpdateSchema = z.strictObject({
  displayName: z.string().trim().min(1).max(80),
  language: z.enum(["es", "en"]),
  timeZone: timeZoneSchema,
  avatar: avatarIdSchema.optional(),
  version: z.number().int().positive(),
});

export const profileSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  language: z.enum(["es", "en"]),
  timeZone: z.string(),
  avatar: avatarIdSchema,
  /** Ya eligió su horario de estudio y compromisos al empezar. */
  onboardingCompleted: z.boolean(),
  version: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
});

export type Profile = z.infer<typeof profileSchema>;
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export const privacyDocumentSchema = z.object({
  id: z.uuid(),
  type: z.enum(["terms", "privacy", "ai"]),
  version: z.number().int().positive(),
  language: z.enum(["es", "en"]),
  content: z.string().min(1),
  publishedAt: z.iso.datetime(),
});
export const privacyDocumentListSchema = z.array(privacyDocumentSchema);
export const consentAcceptSchema = z.strictObject({ documentId: z.uuid() });
export const consentRecordSchema = z.object({
  id: z.uuid(),
  documentId: z.uuid(),
  type: z.enum(["terms", "privacy", "ai"]),
  version: z.number().int().positive(),
  language: z.enum(["es", "en"]),
  decision: z.enum(["accepted", "revoked"]),
  recordedAt: z.iso.datetime(),
});
export const consentListSchema = z.array(consentRecordSchema);
export const accountExportRequestSchema = z.strictObject({
  password: z.string().min(1).max(1024),
  /** JSON completo (por defecto) o un Excel con una hoja por sección. */
  format: z.enum(["json", "xlsx"]).optional(),
});
/** Archivo generado, en base64, para que la app lo guarde o comparta. */
export const accountExportFileSchema = z.object({
  fileName: z.string(),
  mimeType: z.string(),
  base64: z.string(),
});
export const accountDeletionRequestSchema = z.strictObject({
  password: z.string().min(1).max(1024),
  confirmation: z.literal("ELIMINAR"),
});
export const accountDeletionCancelSchema = z.strictObject({
  password: z.string().min(1).max(1024),
  confirmation: z.literal("CANCELAR"),
});
export const accountDeletionStatusSchema = z.object({
  status: z.enum(["pending", "blocked"]),
  blockedReason: z.enum(["last_admin", "policy_mismatch"]).nullable(),
  requestedAt: z.iso.datetime(),
  executeAt: z.iso.datetime(),
});

export const adminDocumentCreateSchema = z.strictObject({
  id: z.uuid(),
  type: z.enum(["terms", "privacy", "ai"]),
  language: z.enum(["es", "en"]),
  version: z.number().int().positive(),
  content: z
    .string()
    .min(1)
    .max(50000)
    .refine((value) => value.trim().length > 0),
});
export const adminDocumentSchema = adminDocumentCreateSchema.extend({
  publishedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export const adminDocumentPageSchema = z.object({
  items: z.array(adminDocumentSchema),
  nextCursor: z.string().nullable(),
});
export const adminPublishSchema = z.strictObject({ confirmation: z.literal("PUBLICAR") });
export const adminAuditSchema = z.object({
  id: z.uuid(),
  actorId: z.uuid(),
  action: z.enum([
    "privacy_document.created",
    "privacy_document.published",
    "ai_provider.updated",
    "ai_route.updated",
    "ai_route.tested",
    "role.assigned",
    "role.changed",
    "role.removed",
    "account.suspended",
    "account.reactivated",
  ]),
  targetId: z.uuid(),
  /** Correo de quien hizo la acción (null si la cuenta ya no existe). */
  actorEmail: z.string().nullable(),
  /** Qué se afectó: una cuenta (su correo), un documento legal o un proveedor de IA. */
  target: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("user"), email: z.string() }),
      z.object({
        kind: z.literal("document"),
        type: z.enum(["terms", "privacy", "ai"]),
        version: z.number().int().positive(),
      }),
      z.object({
        kind: z.literal("provider"),
        provider: z.enum(["openai", "anthropic", "deepseek"]),
      }),
    ])
    .nullable(),
  recordedAt: z.iso.datetime(),
});
export const adminAuditPageSchema = z.object({
  items: z.array(adminAuditSchema),
  nextCursor: z.string().nullable(),
});

export const aiProviderSchema = z.enum(["openai", "anthropic", "deepseek"]);
export const aiUseCaseSchema = z.enum([
  "extract_activity",
  "estimate_duration",
  "explain_risk",
  "explain_replan",
  "propose_subtasks",
  "assistant_chat",
  "onboarding_setup",
]);
export const aiFallbackReasonSchema = z.enum([
  "not_configured",
  "rate_limited",
  "budget_exhausted",
  "invalid_output",
  "provider_unavailable",
]);
const aiSuggestionMetadataSchema = z.object({
  kind: z.literal("suggestion"),
  source: z.literal("ai"),
  requiresConfirmation: z.literal(true),
  promptVersion: z.number().int().positive(),
});
export const aiSuggestionResponseSchema = z.union([
  z.object({ kind: z.literal("manual"), reason: aiFallbackReasonSchema }),
  aiSuggestionMetadataSchema.extend({
    useCase: z.literal("extract_activity"),
    value: z.strictObject({
      title: z.string().trim().min(1).max(160),
      description: z.string().trim().max(1000),
    }),
  }),
  aiSuggestionMetadataSchema.extend({
    useCase: z.literal("estimate_duration"),
    value: z.strictObject({
      minutes: z.number().int().min(5).max(480),
      reason: z.string().trim().min(1).max(300),
    }),
  }),
  aiSuggestionMetadataSchema.extend({
    useCase: z.literal("explain_risk"),
    value: z.strictObject({
      level: z.enum(["low", "medium", "high"]),
      explanation: z.string().trim().min(1).max(500),
    }),
  }),
  aiSuggestionMetadataSchema.extend({
    useCase: z.literal("explain_replan"),
    value: z.strictObject({ explanation: z.string().trim().min(1).max(500) }),
  }),
  aiSuggestionMetadataSchema.extend({
    useCase: z.literal("propose_subtasks"),
    value: z.strictObject({
      subtasks: z.array(z.string().trim().min(1).max(160)).min(1).max(8),
    }),
  }),
]);
export type AiSuggestionResponse = z.infer<typeof aiSuggestionResponseSchema>;
export const adminAiUsageSchema = z.object({
  from: z.iso.date(),
  through: z.iso.date(),
  fallbacks: z.array(
    z.object({
      useCase: aiUseCaseSchema,
      reason: z.enum([
        "not_configured",
        "rate_limited",
        "budget_exhausted",
        "invalid_output",
        "provider_unavailable",
      ]),
      requests: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    }),
  ),
  transitions: z.array(
    z.object({
      useCase: aiUseCaseSchema,
      fromProvider: aiProviderSchema,
      toProvider: aiProviderSchema,
      reason: z.enum(["invalid_output", "provider_unavailable"]),
      requests: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    }),
  ),
  items: z.array(
    z.object({
      useCase: aiUseCaseSchema,
      provider: aiProviderSchema,
      status: z.enum(["reserved", "success", "error", "invalid", "timeout", "unknown"]),
      requests: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      reservedTokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      inputTokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      outputTokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      knownCostUsd: z.string().regex(/^\d+\.\d{9}$/),
      totalCostUsd: z
        .string()
        .regex(/^\d+\.\d{9}$/)
        .nullable(),
      uncostedRequests: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      averageDurationMs: z.number().int().nonnegative().nullable(),
      p95DurationMs: z.number().int().nonnegative().nullable(),
      unmeasuredRequests: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    }),
  ),
});
export type AdminAiUsage = z.infer<typeof adminAiUsageSchema>;
const adminQueueHealthSchema = z.object({
  pending: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  ready: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  inFlight: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  dead: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  oldestReadyAt: z.iso.datetime().nullable(),
});
const adminAiProviderHealthSchema = z.object({
  provider: aiProviderSchema,
  requests: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  successes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  unavailable: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  errors: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
export const adminSystemHealthSchema = z.object({
  database: z.literal("ready"),
  checkedAt: z.iso.datetime(),
  queues: z.object({
    outbox: adminQueueHealthSchema,
    push: adminQueueHealthSchema,
    recoveryMail: adminQueueHealthSchema,
    verificationMail: adminQueueHealthSchema,
  }),
  worker: z.object({
    lastSeenAt: z.iso.datetime().nullable(),
    seenRecently: z.boolean(),
  }),
  ai: z.object({
    windowMinutes: z.literal(15),
    knownCostUsd: z.string().regex(/^\d+\.\d{9}$/),
    uncostedRequests: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    providers: z.array(adminAiProviderHealthSchema),
  }),
  alerts: z.array(
    z.union([
      z.object({
        code: z.enum(["WORKER_UNAVAILABLE", "QUEUE_BACKLOG", "QUEUE_DEAD"]),
        queue: z.enum(["outbox", "push", "recoveryMail", "verificationMail"]).nullable(),
      }),
      z.object({
        code: z.enum(["AI_PROVIDER_UNAVAILABLE", "AI_ERROR_RATE_HIGH"]),
        provider: aiProviderSchema,
      }),
      z.object({ code: z.literal("AI_COST_HIGH") }),
    ]),
  ),
});
export type AdminSystemHealth = z.infer<typeof adminSystemHealthSchema>;
export const adminAiProviderUpdateSchema = z.strictObject({
  apiKey: z.string().min(8).max(512).regex(/^\S+$/).optional(),
  enabled: z.boolean(),
});
export const adminAiProviderSchema = z.object({
  id: z.uuid(),
  provider: aiProviderSchema,
  enabled: z.boolean(),
  keyConfigured: z.literal(true),
  updatedAt: z.iso.datetime().optional(),
});
export const adminAiProviderListSchema = z.array(adminAiProviderSchema);
const aiModelIdSchema = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .regex(/^[A-Za-z0-9._:/-]+$/)
  .refine((value) => !/(?:^|[-_/])latest$/i.test(value));
const aiPriceSchema = z.string().regex(/^(?:0|[1-9]\d{0,5})(?:\.\d{1,6})?$/);
export const adminAiAlternateUpdateSchema = z.strictObject({
  provider: aiProviderSchema,
  modelId: aiModelIdSchema,
  timeoutMs: z.number().int().min(1000).max(30000),
  maxOutputTokens: z.number().int().min(64).max(2048),
  inputPriceUsdPerMillion: aiPriceSchema,
  outputPriceUsdPerMillion: aiPriceSchema,
});
export const adminAiRouteUpdateSchema = z
  .strictObject({
    provider: aiProviderSchema,
    modelId: aiModelIdSchema,
    timeoutMs: z.number().int().min(1000).max(30000),
    maxOutputTokens: z.number().int().min(64).max(2048),
    dailyBudgetTokens: z.number().int().min(100).max(10000000),
    inputPriceUsdPerMillion: aiPriceSchema,
    outputPriceUsdPerMillion: aiPriceSchema,
    alternate: adminAiAlternateUpdateSchema.nullable().optional(),
    enabled: z.boolean(),
  })
  .refine((value) => !value.alternate || value.alternate.provider !== value.provider, {
    path: ["alternate", "provider"],
  });
export const adminAiRouteSchema = z.object({
  useCase: aiUseCaseSchema,
  provider: aiProviderSchema,
  modelId: aiModelIdSchema,
  timeoutMs: z.number().int().min(1000).max(30000),
  maxOutputTokens: z.number().int().min(64).max(2048),
  dailyBudgetTokens: z.number().int().min(100).max(10000000),
  inputPriceUsdPerMillion: aiPriceSchema.nullable(),
  outputPriceUsdPerMillion: aiPriceSchema.nullable(),
  enabled: z.boolean(),
  alternate: z
    .object({
      provider: aiProviderSchema,
      modelId: aiModelIdSchema,
      timeoutMs: z.number().int().min(1000).max(30000),
      maxOutputTokens: z.number().int().min(64).max(2048),
      inputPriceUsdPerMillion: aiPriceSchema.nullable(),
      outputPriceUsdPerMillion: aiPriceSchema.nullable(),
    })
    .nullable(),
});
export const adminAiRouteListSchema = z.array(adminAiRouteSchema);

export const authSessionSchema = z
  .object({
    session: z
      .object({
        id: z.string().min(1),
        createdAt: z.iso.datetime(),
        expiresAt: z.iso.datetime(),
      })
      .passthrough(),
    user: z
      .object({
        id: z.uuid(),
        email: z.email(),
        name: z.string(),
        emailVerified: z.boolean(),
        twoFactorEnabled: z.boolean().optional(),
      })
      .passthrough(),
  })
  .passthrough()
  .nullable();
export const authSignInResultSchema = z
  .object({ twoFactorRedirect: z.boolean().optional() })
  .passthrough();
export const twoFactorEnableResultSchema = z.object({
  method: z.literal("totp"),
  totpURI: z.string().startsWith("otpauth://"),
  backupCodes: z.array(z.string().min(1)).min(1),
});

export const adminUserSuspensionSchema = z
  .strictObject({
    suspended: z.boolean(),
    version: z.number().int().positive(),
    confirmation: z.enum(["SUSPENDER", "REACTIVAR"]),
    password: z.string().min(1).max(1024),
  })
  .refine((value) => value.confirmation === (value.suspended ? "SUSPENDER" : "REACTIVAR"), {
    path: ["confirmation"],
  });
export const adminUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  role: z.enum(["admin", "support"]).nullable(),
  suspendedAt: z.iso.datetime().nullable(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
});
/** Ficha completa de una cuenta para el panel. */
export const adminUserDetailSchema = adminUserSchema.extend({
  emailVerified: z.boolean(),
  twoFactorEnabled: z.boolean(),
  updatedAt: z.iso.datetime(),
  profile: z
    .object({
      displayName: z.string(),
      timeZone: z.string(),
      avatar: z.string(),
      onboardingCompleted: z.boolean(),
    })
    .nullable(),
  counts: z.object({
    activities: z.number().int().nonnegative(),
    completedActivities: z.number().int().nonnegative(),
    commitments: z.number().int().nonnegative(),
    studyHours: z.number().int().nonnegative(),
    pushDevices: z.number().int().nonnegative(),
    streakDays: z.number().int().nonnegative(),
  }),
  deletionRequestedAt: z.iso.datetime().nullable(),
});
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;
export const adminUserPageSchema = z.object({
  items: z.array(adminUserSchema),
  nextCursor: z.string().nullable(),
});
export const adminUserStateSchema = z.object({
  userId: z.uuid(),
  suspendedAt: z.iso.datetime().nullable(),
  version: z.number().int().positive(),
});

export const adminRoleUpdateSchema = z.strictObject({
  role: z.enum(["admin", "support"]),
  version: z.number().int().min(0),
  confirmation: z.literal("ASIGNAR"),
  password: z.string().min(1).max(1024),
});
export const adminRoleRemoveSchema = z.strictObject({
  version: z.number().int().positive(),
  confirmation: z.literal("QUITAR"),
  password: z.string().min(1).max(1024),
});
export const adminRoleSchema = z.object({
  userId: z.uuid(),
  email: z.email(),
  role: z.enum(["admin", "support"]),
  version: z.number().int().positive(),
  assignedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const adminRolePageSchema = z.object({
  items: z.array(adminRoleSchema),
  nextCursor: z.string().nullable(),
});

export const preferencesUpdateSchema = z
  .strictObject({
    minSessionMinutes: z.number().int().min(1).max(240),
    maxSessionMinutes: z.number().int().min(1).max(480),
    maxDailyMinutes: z.number().int().min(1).max(1440),
    notificationsEnabled: z.boolean(),
    pushNotificationsEnabled: z.boolean().optional(),
    quietStartMinute: z.number().int().min(0).max(1439),
    quietEndMinute: z.number().int().min(0).max(1439),
    version: z.number().int().positive(),
  })
  .refine(
    (value) =>
      value.maxSessionMinutes >= value.minSessionMinutes &&
      value.maxDailyMinutes >= value.minSessionMinutes &&
      value.quietStartMinute !== value.quietEndMinute,
    { path: ["maxSessionMinutes"] },
  );
export const preferencesSchema = preferencesUpdateSchema.safeExtend({
  pushNotificationsEnabled: z.boolean(),
  updatedAt: z.iso.datetime(),
});

/** Cuerpo con solo la versión esperada, para acciones con control optimista. */
export const versionSchema = z.strictObject({ version: z.number().int().positive() });

export const activityKindSchema = z.enum(["academic_task", "exam", "personal", "routine"]);

/** Clasificación del requisito RF-10: académica, personal o cotidiana. */
export type ActivityCategory = "academic" | "personal" | "daily";
export function activityCategory(kind: z.infer<typeof activityKindSchema>): ActivityCategory {
  if (kind === "academic_task" || kind === "exam") return "academic";
  return kind === "personal" ? "personal" : "daily";
}
export const activityPrioritySchema = z.enum(["low", "medium", "high", "critical"]);
export const activitySeriesCreateSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(["academic_task", "personal", "routine"]),
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(10000).nullable(),
  priority: activityPrioritySchema,
  estimatedMinutes: z.number().int().min(1).max(1440),
  frequency: z.enum(["daily", "weekly"]),
  startOn: z.iso.date(),
  throughOn: z.iso.date(),
});
export const activitySeriesSchema = activitySeriesCreateSchema.extend({
  timeZone: timeZoneSchema,
  instanceCount: z.number().int().min(1).max(60),
  createdAt: z.iso.datetime(),
});
export const activitySeriesCursorSchema = z.strictObject({
  sortOrder: z.string().regex(/^[1-9][0-9]*$/),
});
export const activitySeriesPageSchema = z.object({
  items: z.array(activitySeriesSchema),
  nextCursor: z.string().nullable(),
});
export type ActivitySeriesCreate = z.infer<typeof activitySeriesCreateSchema>;
export const activityStatusSchema = z.enum([
  "backlog",
  "planned",
  "in_progress",
  "completed",
  "cancelled",
]);

const activityFieldsObjectSchema = z.strictObject({
  kind: activityKindSchema,
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(10000).nullable(),
  priority: activityPrioritySchema,
  startAfterAt: z.iso.datetime().nullable(),
  deadlineAt: z.iso.datetime().nullable(),
  estimatedMinutes: z.number().int().positive().max(525600).nullable(),
});
/** Campos editables de una actividad; el asistente propone cambios parciales. */
export const activityChangesSchema = activityFieldsObjectSchema.partial();
export const activityFieldsSchema = activityFieldsObjectSchema.refine(
  (fields) =>
    !fields.startAfterAt ||
    !fields.deadlineAt ||
    Date.parse(fields.deadlineAt) >= Date.parse(fields.startAfterAt),
  { message: "La fecha límite debe ser posterior al inicio mínimo.", path: ["deadlineAt"] },
);

export const activityCreateSchema = activityFieldsSchema.safeExtend({ id: z.uuid() });
export const activityUpdateSchema = activityFieldsSchema.safeExtend({
  version: z.number().int().positive(),
});
export const activityTransitionSchema = z.strictObject({
  version: z.number().int().positive(),
  mutationId: z.uuid(),
});
export const activityDeleteSchema = activityTransitionSchema;
export const activityProgressSchema = activityTransitionSchema.extend({
  progressPercent: z.number().int().min(0).max(100),
});

export const activitySchema = z.object({
  id: z.uuid(),
  seriesId: z.uuid().nullable(),
  occursOn: z.iso.date().nullable(),
  kind: activityKindSchema,
  title: z.string(),
  description: z.string().nullable(),
  priority: activityPrioritySchema,
  status: activityStatusSchema,
  startAfterAt: z.iso.datetime().nullable(),
  deadlineAt: z.iso.datetime().nullable(),
  estimatedMinutes: z.number().int().positive().nullable(),
  progressPercent: z.number().int().min(0).max(100),
  completedAt: z.iso.datetime().nullable(),
  archivedAt: z.iso.datetime().nullable(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const activityPageSchema = z.object({
  items: z.array(activitySchema),
  nextCursor: z.string().nullable(),
});

export const activitySummarySchema = z.object({
  day: z.iso.date(),
  dueToday: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  inProgress: z.number().int().nonnegative(),
  overdue: z.number().int().nonnegative(),
  /** Semana local lunes–domingo que contiene `day`. */
  week: z.object({
    from: z.iso.date(),
    through: z.iso.date(),
    due: z.number().int().nonnegative(),
    completedDue: z.number().int().nonnegative(),
    days: z
      .array(
        z.object({
          date: z.iso.date(),
          completed: z.number().int().nonnegative(),
          due: z.number().int().nonnegative(),
        }),
      )
      .length(7),
  }),
  /**
   * Avance por clasificación del requisito RF-10, siempre en este orden:
   * académicas (tarea o examen), personales y cotidianas (rutinas).
   */
  categories: z
    .array(
      z.object({
        category: z.enum(["academic", "personal", "daily"]),
        total: z.number().int().nonnegative(),
        completed: z.number().int().nonnegative(),
      }),
    )
    .length(3),
  /** Días locales consecutivos con al menos una actividad completada, hasta hoy o ayer. */
  streakDays: z.number().int().nonnegative(),
});
export const streakSchema = z.object({
  today: z.iso.date(),
  current: z.number().int().nonnegative(),
  best: z.number().int().nonnegative(),
  todayDone: z.boolean(),
  freezeAvailable: z.boolean(),
  perfectWeeks: z.number().int().nonnegative(),
  week: z
    .array(
      z.object({
        date: z.iso.date(),
        status: z.enum(["done", "protected", "missed", "pending", "future"]),
      }),
    )
    .length(7),
});
export type StreakView = z.infer<typeof streakSchema>;

export type ActivitySummary = z.infer<typeof activitySummarySchema>;

export const activityCursorSchema = z.strictObject({
  sortOrder: z.string().regex(/^[1-9]\d{0,18}$/),
});

export const activityHistorySchema = z.object({
  id: z.string().regex(/^[1-9]\d*$/),
  mutationId: z.uuid(),
  eventType: z.enum([
    "completed",
    "reopened",
    "cancelled",
    "started",
    "paused",
    "progress_updated",
    "deleted",
  ]),
  beforeStatus: activityStatusSchema,
  afterStatus: activityStatusSchema,
  beforeProgress: z.number().int().min(0).max(100),
  afterProgress: z.number().int().min(0).max(100),
  createdAt: z.iso.datetime(),
});

export const activityHistoryPageSchema = z.object({
  items: z.array(activityHistorySchema),
  nextCursor: z.string().nullable(),
});

export const activityHistoryCursorSchema = z.strictObject({
  id: z.string().regex(/^[1-9]\d{0,18}$/),
});

export type Activity = z.infer<typeof activitySchema>;
export type ActivityCreate = z.infer<typeof activityCreateSchema>;
export type ActivityUpdate = z.infer<typeof activityUpdateSchema>;
export type ActivityPage = z.infer<typeof activityPageSchema>;

export const subtaskCreateSchema = z.strictObject({
  id: z.uuid(),
  title: z.string().trim().min(1).max(240),
  estimatedMinutes: z.number().int().positive().max(525600).nullable(),
});

export const subtaskUpdateSchema = z.strictObject({
  title: z.string().trim().min(1).max(240),
  estimatedMinutes: z.number().int().positive().max(525600).nullable(),
  isCompleted: z.boolean(),
  version: z.number().int().positive(),
  mutationId: z.uuid(),
});

export const subtaskVersionSchema = z.strictObject({
  version: z.number().int().positive(),
  mutationId: z.uuid(),
});

export const subtaskSchema = z.object({
  id: z.uuid(),
  activityId: z.uuid(),
  title: z.string(),
  estimatedMinutes: z.number().int().positive().nullable(),
  isCompleted: z.boolean(),
  completedAt: z.iso.datetime().nullable(),
  archivedAt: z.iso.datetime().nullable(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const subtaskPageSchema = z.object({
  items: z.array(subtaskSchema),
  nextCursor: z.string().nullable(),
});

export const subtaskCursorSchema = z.strictObject({
  sortOrder: z.string().regex(/^[1-9]\d{0,18}$/),
});

export type Subtask = z.infer<typeof subtaskSchema>;
export type SubtaskCreate = z.infer<typeof subtaskCreateSchema>;
export type SubtaskUpdate = z.infer<typeof subtaskUpdateSchema>;

export const calendarEventKindSchema = z.enum([
  "class",
  "work",
  "appointment",
  "personal",
  "unavailable",
  "other",
]);

const calendarEventFieldsObjectSchema = z.strictObject({
  kind: calendarEventKindSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10000).nullable(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  timeZone: timeZoneSchema,
});
/** Campos editables de un evento; el asistente propone cambios parciales. */
export const calendarEventChangesSchema = calendarEventFieldsObjectSchema
  .omit({ timeZone: true })
  .partial();
export const calendarEventFieldsSchema = calendarEventFieldsObjectSchema.refine(
  (fields) => Date.parse(fields.endsAt) > Date.parse(fields.startsAt),
  {
    message: "El fin debe ser posterior al inicio.",
    path: ["endsAt"],
  },
);

export const calendarEventCreateSchema = calendarEventFieldsSchema.safeExtend({ id: z.uuid() });
export const calendarEventUpdateSchema = calendarEventFieldsSchema.safeExtend({
  version: z.number().int().positive(),
  mutationId: z.uuid(),
});
export const calendarEventVersionSchema = z.strictObject({
  version: z.number().int().positive(),
  mutationId: z.uuid(),
});

export const calendarEventSchema = z.object({
  id: z.uuid(),
  kind: calendarEventKindSchema,
  title: z.string(),
  description: z.string().nullable(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  timeZone: timeZoneSchema,
  isLocked: z.literal(true),
  source: z.literal("manual"),
  archivedAt: z.iso.datetime().nullable(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const calendarEventPageSchema = z.object({
  items: z.array(calendarEventSchema),
  nextCursor: z.string().nullable(),
});
export const calendarEventCursorSchema = z.strictObject({
  sortOrder: z.string().regex(/^[1-9]\d{0,18}$/),
});
export const calendarEventDayCursorSchema = z.strictObject({
  startsAt: z.iso.datetime(),
  id: z.uuid(),
});

export type CalendarEvent = z.infer<typeof calendarEventSchema>;
export type CalendarEventCreate = z.infer<typeof calendarEventCreateSchema>;
export type CalendarEventUpdate = z.infer<typeof calendarEventUpdateSchema>;

export const dateRangeSchema = z.strictObject({
  from: z.iso.date(),
  through: z.iso.date(),
});

export const availabilityWindowSchema = z
  .strictObject({
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
  })
  .refine((value) => value.endMinute > value.startMinute, { path: ["endMinute"] });

export const availabilityRuleCreateSchema = z
  .strictObject({
    id: z.uuid(),
    weekday: z.number().int().min(1).max(7),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(2879),
  })
  .refine(
    (value) => value.endMinute > value.startMinute && value.endMinute - value.startMinute <= 1440,
    {
      path: ["endMinute"],
    },
  );
export const availabilityRuleUpdateSchema = z
  .strictObject({
    weekday: z.number().int().min(1).max(7),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(2879),
    version: z.number().int().positive(),
  })
  .refine(
    (value) => value.endMinute > value.startMinute && value.endMinute - value.startMinute <= 1440,
    { path: ["endMinute"] },
  );
export const availabilityRuleSchema = availabilityRuleCreateSchema.safeExtend({
  version: z.number().int().positive(),
  archivedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
});
export const availabilityRuleListSchema = z.object({ items: z.array(availabilityRuleSchema) });

export const availabilityExceptionWriteSchema = z
  .strictObject({
    version: z.number().int().positive().nullable(),
    windows: z.array(availabilityWindowSchema).max(12),
  })
  .refine(
    (value) =>
      value.windows.every(
        (window, index) =>
          index === 0 || (value.windows[index - 1]?.endMinute ?? 1441) <= window.startMinute,
      ),
    { path: ["windows"], message: "Ordena las ventanas sin solapamientos." },
  );
export const availabilityExceptionSchema = z.object({
  date: z.iso.date(),
  windows: z.array(availabilityWindowSchema),
  version: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
});
export const availabilityExceptionListSchema = z.object({
  items: z.array(availabilityExceptionSchema),
});
export const availabilityCapacitySchema = z.object({
  from: z.iso.date(),
  through: z.iso.date(),
  timeZone: timeZoneSchema,
  slots: z.array(z.object({ startsAt: z.iso.datetime(), endsAt: z.iso.datetime() })),
  daily: z.array(z.object({ date: z.iso.date(), availableMinutes: z.number().nonnegative() })),
  totalMinutes: z.number().nonnegative(),
});

export type AvailabilityRuleCreate = z.infer<typeof availabilityRuleCreateSchema>;
export type AvailabilityRuleUpdate = z.infer<typeof availabilityRuleUpdateSchema>;
export type AvailabilityExceptionWrite = z.infer<typeof availabilityExceptionWriteSchema>;

export const planPreviewSchema = z.strictObject({
  id: z.uuid(),
  from: z.iso.date(),
  through: z.iso.date(),
  minSessionMinutes: z.number().int().min(1).max(240).optional(),
  maxSessionMinutes: z.number().int().min(1).max(480).optional(),
  maxDailyMinutes: z.number().int().min(1).max(1440).optional(),
});
export const planActionSchema = z.strictObject({ version: z.number().int().positive() });
export const planBlockEditSchema = z
  .strictObject({
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    isLocked: z.boolean(),
    version: z.number().int().positive(),
  })
  .refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt), { path: ["endsAt"] });
export const planBlockSchema = z.object({
  id: z.uuid(),
  activityId: z.uuid(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  isLocked: z.boolean(),
});
export const planSchema = z.object({
  id: z.uuid(),
  status: z.enum(["draft", "active", "superseded", "rejected"]),
  version: z.number().int().positive(),
  algorithmVersion: z.string(),
  sourceRevision: z.string().regex(/^\d+$/),
  from: z.iso.date(),
  through: z.iso.date(),
  minSessionMinutes: z.number().int().positive(),
  maxSessionMinutes: z.number().int().positive(),
  maxDailyMinutes: z.number().int().positive(),
  blocks: z.array(planBlockSchema),
  unscheduled: z.array(
    z.object({
      activityId: z.uuid(),
      minutes: z.number().int().positive(),
      reason: z.enum(["deadline_passed", "insufficient_capacity", "below_min_session"]),
    }),
  ),
  risk: z.array(
    z.object({
      activityId: z.uuid(),
      remainingMinutes: z.number().int().nonnegative(),
      capacityMinutes: z.number().int().nonnegative(),
      marginMinutes: z.number().int(),
      level: z.enum(["low", "medium", "high"]),
      reasons: z.array(z.string()),
    }),
  ),
  createdAt: z.iso.datetime(),
  appliedAt: z.iso.datetime().nullable(),
});
export const activePlanSchema = planSchema.extend({
  currentSourceRevision: z.string().regex(/^\d+$/),
  isStale: z.boolean(),
});
export const riskAssessmentPageSchema = z.object({
  from: z.iso.date(),
  through: z.iso.date(),
  timeZone: timeZoneSchema,
  computedAt: z.iso.datetime(),
  algorithmVersion: z.string(),
  sourceRevision: z.string().regex(/^\d+$/),
  risk: planSchema.shape.risk,
  unscheduled: planSchema.shape.unscheduled,
});
export const planHistoryCursorSchema = z.strictObject({
  createdAt: z.iso.datetime(),
  id: z.uuid(),
});
export const planHistoryPageSchema = z.object({
  items: z.array(planSchema.omit({ blocks: true, unscheduled: true, risk: true })),
  nextCursor: z.string().nullable(),
});
export type PlanPreview = z.infer<typeof planPreviewSchema>;
export type PlanBlockEdit = z.infer<typeof planBlockEditSchema>;

export const timeEntryStartSchema = z.strictObject({ id: z.uuid(), activityId: z.uuid() });
export const timeEntryStopSchema = z.strictObject({
  version: z.number().int().positive(),
  mutationId: z.uuid(),
});
export const timeEntryManualSchema = z.strictObject({
  id: z.uuid(),
  activityId: z.uuid(),
  minutes: z.number().int().min(1).max(1440),
  endsAt: z.iso.datetime(),
});
export const timeEntrySchema = z.object({
  id: z.uuid(),
  activityId: z.uuid(),
  source: z.enum(["timer", "manual"]),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().nullable(),
  durationSeconds: z.number().int().positive().nullable(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
});
export const timeEntryPageSchema = z.object({
  items: z.array(timeEntrySchema),
  nextCursor: z.string().nullable(),
});
export const activeTimeEntrySchema = z.object({ item: timeEntrySchema.nullable() });
export const timeEntryCursorSchema = z.strictObject({ createdAt: z.iso.datetime(), id: z.uuid() });
export const timeStatisticsSchema = z.object({
  from: z.iso.date(),
  through: z.iso.date(),
  timeZone: timeZoneSchema,
  totalSeconds: z.number().int().nonnegative(),
  weeks: z.array(
    z.object({
      weekStart: z.iso.date(),
      seconds: z.number().int().nonnegative(),
      completedActivities: z.number().int().nonnegative(),
      dueActivities: z.number().int().nonnegative(),
      overdueActivities: z.number().int().nonnegative(),
      onTimeActivities: z.number().int().nonnegative(),
      onTimePercent: z.number().int().min(0).max(100).nullable(),
    }),
  ),
  activities: z.array(
    z.object({
      activityId: z.uuid(),
      title: z.string(),
      estimatedMinutes: z.number().int().positive().nullable(),
      actualSeconds: z.number().int().nonnegative(),
    }),
  ),
});

export const notificationSchema = z.object({
  id: z.uuid(),
  type: z.enum([
    "plan_applied",
    "deadline_reminder",
    "block_reminder",
    "risk_alert",
    "streak_at_risk",
    "report_updated",
  ]),
  planId: z.uuid().nullable(),
  reportId: z.uuid().nullable(),
  activityId: z.uuid().nullable(),
  blockId: z.uuid().nullable(),
  referenceAt: z.iso.datetime().nullable(),
  readAt: z.iso.datetime().nullable(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
});
export const notificationPreferencesUpdateSchema = z.strictObject({
  deadlineLeadMinutes: z.number().int().min(15).max(10080),
  blockLeadMinutes: z.number().int().min(5).max(120),
  riskCooldownMinutes: z.number().int().min(60).max(10080),
  version: z.number().int().positive(),
});
export const notificationPreferencesSchema = notificationPreferencesUpdateSchema.extend({
  updatedAt: z.iso.datetime(),
});
export const pushDeviceRegisterSchema = z.strictObject({
  id: z.uuid(),
  platform: z.enum(["android", "ios"]),
  token: z.string().min(20).max(4096).regex(/^\S+$/),
});
export const pushDeviceSchema = z.object({
  id: z.uuid(),
  platform: z.enum(["android", "ios"]),
  updatedAt: z.iso.datetime(),
});
export const pushDeviceListSchema = z.array(pushDeviceSchema);
export const notificationPageSchema = z.object({
  items: z.array(notificationSchema),
  nextCursor: z.string().nullable(),
});
export { configureZodSpanish } from "./zod-es";

/**
 * Asistente conversacional. La conversación no se guarda en el servidor: la app
 * envía las últimas intervenciones con cada mensaje.
 */
export const assistantMessageSchema = z.strictObject({
  role: z.enum(["user", "assistant"]),
  text: z.string().trim().min(1).max(2000),
});
export const assistantTurnRequestSchema = z.strictObject({
  message: z.string().trim().min(1).max(2000),
  history: z.array(assistantMessageSchema).max(12),
});
export const activityTransitionActionSchema = z.enum([
  "complete",
  "reopen",
  "cancel",
  "start",
  "pause",
]);
/**
 * Cambios que el asistente propone y el estudiante confirma (RF-30). La app los
 * aplica con las rutas de siempre; `title` es el nombre actual, leído de la base.
 */
export const assistantActionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("create_activity"), activity: activityFieldsSchema }),
  z.strictObject({
    type: z.literal("update_activity"),
    activityId: z.uuid(),
    title: z.string(),
    changes: activityChangesSchema,
  }),
  z.strictObject({
    type: z.literal("set_activity_progress"),
    activityId: z.uuid(),
    title: z.string(),
    progressPercent: z.number().int().min(0).max(100),
  }),
  z.strictObject({
    type: z.literal("transition_activity"),
    activityId: z.uuid(),
    title: z.string(),
    transition: activityTransitionActionSchema,
  }),
  z.strictObject({ type: z.literal("delete_activity"), activityId: z.uuid(), title: z.string() }),
  z.strictObject({
    type: z.literal("create_subtasks"),
    activityId: z.uuid(),
    title: z.string(),
    subtasks: z
      .array(
        z.strictObject({
          title: z.string().trim().min(1).max(240),
          estimatedMinutes: z.number().int().positive().max(525600).nullable(),
        }),
      )
      .min(1)
      .max(8),
  }),
  z.strictObject({ type: z.literal("create_event"), event: calendarEventFieldsSchema }),
  z.strictObject({
    type: z.literal("update_event"),
    eventId: z.uuid(),
    title: z.string(),
    changes: calendarEventChangesSchema,
  }),
  z.strictObject({ type: z.literal("archive_event"), eventId: z.uuid(), title: z.string() }),
]);
export const assistantTurnResponseSchema = z.union([
  z.object({ kind: z.literal("manual"), reason: aiFallbackReasonSchema }),
  z.object({
    kind: z.literal("reply"),
    source: z.literal("ai"),
    requiresConfirmation: z.literal(true),
    promptVersion: z.number().int().positive(),
    reply: z.string().trim().min(1).max(1200),
    actions: z.array(assistantActionSchema).max(5),
  }),
]);
const clockSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
/** Semana que arma el agente de configuración inicial; la app la guarda al confirmar. */
export const onboardingDraftSchema = z.strictObject({
  /** Horas en que puede estudiar; si el fin es menor que el inicio, termina al día siguiente. */
  studyHours: z
    .array(
      z.strictObject({
        weekday: z.number().int().min(1).max(7),
        start: clockSchema,
        end: clockSchema,
      }),
    )
    .max(28),
  maxDailyMinutes: z.number().int().min(30).max(720).nullable(),
  /** Compromisos fijos semanales (clases, trabajo); `until` null = falta preguntarlo. */
  commitments: z
    .array(
      z.strictObject({
        title: z.string().trim().min(1).max(120),
        kind: z.enum(["class", "work", "other"]),
        weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
        start: clockSchema,
        end: clockSchema,
        until: z.iso.date().nullable(),
      }),
    )
    .max(20),
});
export const onboardingTurnRequestSchema = z.strictObject({
  message: z.string().trim().min(1).max(2000),
  history: z.array(assistantMessageSchema).max(16),
  draft: onboardingDraftSchema,
});
export const onboardingTurnResponseSchema = z.union([
  z.object({ kind: z.literal("manual"), reason: aiFallbackReasonSchema }),
  z.object({
    kind: z.literal("reply"),
    reply: z.string().trim().min(1).max(1200),
    draft: onboardingDraftSchema,
    /** El agente cree que no falta nada; el estudiante igual revisa y guarda. */
    complete: z.boolean(),
  }),
]);
export type OnboardingDraft = z.infer<typeof onboardingDraftSchema>;
export type OnboardingTurnResponse = z.infer<typeof onboardingTurnResponseSchema>;
export type AssistantMessage = z.infer<typeof assistantMessageSchema>;
export type AssistantAction = z.infer<typeof assistantActionSchema>;
export type AssistantTurnResponse = z.infer<typeof assistantTurnResponseSchema>;

/** Reportes: el estudiante los envía desde la app y soporte los atiende en el panel. */
export const reportTypeSchema = z.enum(["bug", "suggestion", "account", "other"]);
export const reportStatusSchema = z.enum(["new", "in_review", "resolved", "closed"]);
export const reportContextSchema = z.strictObject({
  platform: z.string().max(20).nullable(),
  osVersion: z.string().max(40).nullable(),
  appVersion: z.string().max(40).nullable(),
});
export const reportCreateSchema = z.strictObject({
  id: z.uuid(),
  type: reportTypeSchema,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(5000),
  context: reportContextSchema,
});
export const reportSchema = z.object({
  id: z.uuid(),
  type: reportTypeSchema,
  title: z.string(),
  description: z.string(),
  status: reportStatusSchema,
  reply: z.string().nullable(),
  repliedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const reportListSchema = z.object({ items: z.array(reportSchema).max(100) });

export const adminReportSchema = reportSchema.extend({
  userId: z.uuid(),
  userEmail: z.string(),
  userName: z.string(),
  assigneeId: z.uuid().nullable(),
  assigneeEmail: z.string().nullable(),
  context: reportContextSchema,
  closedAt: z.iso.datetime().nullable(),
  version: z.number().int().positive(),
});
export const adminReportPageSchema = z.object({
  items: z.array(adminReportSchema),
  nextCursor: z.string().nullable(),
});
export const adminReportDetailSchema = adminReportSchema.extend({
  history: z.array(
    z.object({
      action: z.enum(["created", "assigned", "status_changed", "replied"]),
      actorEmail: z.string().nullable(),
      detail: z.record(z.string(), z.unknown()),
      recordedAt: z.iso.datetime(),
    }),
  ),
});
/** Cambios de soporte sobre un reporte: cualquiera de los tres, con la versión vista. */
export const adminReportUpdateSchema = z
  .strictObject({
    version: z.number().int().positive(),
    status: reportStatusSchema.optional(),
    assignToMe: z.boolean().optional(),
    reply: z.string().trim().min(1).max(2000).optional(),
  })
  .refine((value) => value.status || value.assignToMe || value.reply, {
    message: "Indica algún cambio.",
  });
/** Quién entró al panel y con qué rol: el menú muestra solo lo que ese rol puede usar. */
export const adminMeSchema = z.object({
  userId: z.uuid(),
  email: z.string(),
  role: z.enum(["admin", "support"]),
});
export type Report = z.infer<typeof reportSchema>;
export type ReportCreate = z.infer<typeof reportCreateSchema>;
export type AdminReport = z.infer<typeof adminReportSchema>;
export type AdminReportDetail = z.infer<typeof adminReportDetailSchema>;
export type AdminMe = z.infer<typeof adminMeSchema>;
