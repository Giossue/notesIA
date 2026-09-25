import { z } from "zod";

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

export const profileUpdateSchema = z.strictObject({
  displayName: z.string().trim().min(1).max(80),
  language: z.enum(["es", "en"]),
  timeZone: timeZoneSchema,
  version: z.number().int().positive(),
});

export const profileSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  language: z.enum(["es", "en"]),
  timeZone: z.string(),
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
]);
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
  password: z.string().min(1).max(1024),
});
const aiModelIdSchema = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .regex(/^[A-Za-z0-9._:/-]+$/)
  .refine((value) => !/(?:^|[-_/])latest$/i.test(value));
const aiPriceSchema = z.string().regex(/^(?:0|[1-9]\d{0,5})(?:\.\d{1,6})?$/);
const aiAlternateSchema = z.strictObject({
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
    alternate: aiAlternateSchema.nullable().optional(),
    enabled: z.boolean(),
    capabilityReviewed: z.boolean(),
    costReviewed: z.boolean(),
    privacyReviewed: z.boolean(),
    password: z.string().min(1).max(1024),
  })
  .refine(
    (value) =>
      !value.enabled || (value.capabilityReviewed && value.costReviewed && value.privacyReviewed),
  )
  .refine((value) => !value.alternate || value.alternate.provider !== value.provider, {
    path: ["alternate", "provider"],
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

export const subjectColorSchema = z.enum(["primary", "secondary", "tertiary"]);

export const subjectCreateSchema = z.strictObject({
  id: z.uuid(),
  periodId: z.uuid().nullable().optional(),
  name: z.string().trim().min(1).max(160),
  code: z.string().trim().min(1).max(40).nullable(),
  colorToken: subjectColorSchema,
});

export const subjectUpdateSchema = subjectCreateSchema.omit({ id: true }).extend({
  version: z.number().int().positive(),
});

export const subjectVersionSchema = z.strictObject({ version: z.number().int().positive() });

export const subjectSchema = z.object({
  id: z.uuid(),
  periodId: z.uuid().nullable(),
  name: z.string(),
  code: z.string().nullable(),
  colorToken: subjectColorSchema,
  archivedAt: z.iso.datetime().nullable(),
  version: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
});

export const subjectPageSchema = z.object({
  items: z.array(subjectSchema),
  nextCursor: z.string().nullable(),
});

export const subjectCursorSchema = z.strictObject({
  sortOrder: z.string().regex(/^[1-9]\d{0,18}$/),
});

export type Subject = z.infer<typeof subjectSchema>;
export type SubjectCreate = z.infer<typeof subjectCreateSchema>;
export type SubjectUpdate = z.infer<typeof subjectUpdateSchema>;
export type SubjectPage = z.infer<typeof subjectPageSchema>;

export const academicPeriodCreateSchema = z
  .strictObject({
    id: z.uuid(),
    name: z.string().trim().min(1).max(120),
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
  })
  .refine((value) => value.endsOn >= value.startsOn, { path: ["endsOn"] });
export const academicPeriodUpdateSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(120),
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
    version: z.number().int().positive(),
  })
  .refine((value) => value.endsOn >= value.startsOn, { path: ["endsOn"] });
export const academicPeriodSchema = academicPeriodCreateSchema.safeExtend({
  archivedAt: z.iso.datetime().nullable(),
  version: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
});
export const academicPeriodPageSchema = z.object({
  items: z.array(academicPeriodSchema),
  nextCursor: z.string().nullable(),
});
export type AcademicPeriodCreate = z.infer<typeof academicPeriodCreateSchema>;
export type AcademicPeriodUpdate = z.infer<typeof academicPeriodUpdateSchema>;

export const activityKindSchema = z.enum(["academic_task", "exam", "personal", "routine"]);
export const activityPrioritySchema = z.enum(["low", "medium", "high", "critical"]);
export const activitySeriesCreateSchema = z.strictObject({
  id: z.uuid(),
  subjectId: z.uuid().nullable(),
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

const activityFieldsSchema = z
  .strictObject({
    subjectId: z.uuid().nullable(),
    kind: activityKindSchema,
    title: z.string().trim().min(1).max(240),
    description: z.string().trim().max(10000).nullable(),
    priority: activityPrioritySchema,
    startAfterAt: z.iso.datetime().nullable(),
    deadlineAt: z.iso.datetime().nullable(),
    estimatedMinutes: z.number().int().positive().max(525600).nullable(),
  })
  .refine(
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
  subjectId: z.uuid().nullable(),
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

export const activityCursorSchema = z.strictObject({
  sortOrder: z.string().regex(/^[1-9]\d{0,18}$/),
});

export const activityHistorySchema = z.object({
  id: z.string().regex(/^[1-9]\d*$/),
  mutationId: z.uuid(),
  eventType: z.enum(["completed", "reopened", "progress_updated", "deleted"]),
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

const calendarEventFieldsSchema = z
  .strictObject({
    subjectId: z.uuid().nullable(),
    kind: calendarEventKindSchema,
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(10000).nullable(),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    timeZone: timeZoneSchema,
  })
  .refine((fields) => Date.parse(fields.endsAt) > Date.parse(fields.startsAt), {
    message: "El fin debe ser posterior al inicio.",
    path: ["endsAt"],
  });

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
  subjectId: z.uuid().nullable(),
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
  subjects: z.array(
    z.object({ subjectId: z.uuid().nullable(), seconds: z.number().int().nonnegative() }),
  ),
});

export const notificationSchema = z.object({
  id: z.uuid(),
  type: z.enum(["plan_applied", "deadline_reminder", "block_reminder", "risk_alert"]),
  planId: z.uuid().nullable(),
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
