import {
  bigint,
  boolean,
  char,
  date,
  integer,
  jsonb,
  pgSchema,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const authSchema = pgSchema("autenticacion");
const domainSchema = pgSchema("dominio");

export const authUsers = authSchema.table("usuarios", {
  id: uuid("id").primaryKey(),
});

export const userProfiles = domainSchema.table("perfiles_usuario", {
  userId: uuid("usuario_id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  displayName: text("nombre").notNull(),
  language: text("idioma").notNull().default("es"),
  timeZone: text("zona_horaria").notNull().default("Etc/UTC"),
  avatar: text("avatar").notNull().default("avatar-coffee-cup"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
});

export const userPreferences = domainSchema.table("preferencias_usuario", {
  userId: uuid("usuario_id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  minSessionMinutes: integer("sesion_minima").notNull().default(25),
  maxSessionMinutes: integer("sesion_maxima").notNull().default(90),
  maxDailyMinutes: integer("maximo_diario").notNull().default(240),
  notificationsEnabled: boolean("notificaciones_habilitadas").notNull().default(true),
  pushNotificationsEnabled: boolean("push_habilitado").notNull().default(true),
  quietStartMinute: smallint("minuto_silencio_inicio").notNull().default(1320),
  quietEndMinute: smallint("minuto_silencio_fin").notNull().default(420),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationPreferences = domainSchema.table("preferencias_avisos", {
  userId: uuid("usuario_id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  deadlineLeadMinutes: integer("anticipacion_plazo_minutos").notNull().default(1440),
  blockLeadMinutes: integer("anticipacion_bloque_minutos").notNull().default(15),
  riskCooldownMinutes: integer("enfriamiento_riesgo_minutos").notNull().default(1440),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
});

export const subjects = domainSchema.table("materias", {
  id: uuid("id").primaryKey(),
  sortOrder: bigint("orden", { mode: "bigint" }).notNull().generatedAlwaysAsIdentity(),
  userId: uuid("usuario_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  periodId: uuid("periodo_id"),
  name: varchar("nombre", { length: 160 }).notNull(),
  colorToken: text("color", { enum: ["primary", "secondary", "tertiary"] })
    .notNull()
    .default("primary"),
  createdAt: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archivado_en", { withTimezone: true }),
  deletedAt: timestamp("eliminado_en", { withTimezone: true }),
  version: integer("version").notNull().default(1),
});

export const academicPeriods = domainSchema.table("periodos_academicos", {
  id: uuid("id").primaryKey(),
  sortOrder: bigint("orden", { mode: "bigint" }).notNull().generatedAlwaysAsIdentity(),
  userId: uuid("usuario_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  name: varchar("nombre", { length: 120 }).notNull(),
  startsOn: date("inicia_el", { mode: "string" }).notNull(),
  endsOn: date("termina_el", { mode: "string" }).notNull(),
  version: integer("version").notNull().default(1),
  archivedAt: timestamp("archivado_en", { withTimezone: true }),
  updatedAt: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
});

export const activitySeries = domainSchema.table("series_actividades", {
  id: uuid("id").primaryKey(),
  sortOrder: bigint("orden", { mode: "bigint" }).notNull().generatedAlwaysAsIdentity(),
  userId: uuid("usuario_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  subjectId: uuid("materia_id"),
  kind: text("tipo", { enum: ["academic_task", "personal", "routine"] }).notNull(),
  title: varchar("titulo", { length: 240 }).notNull(),
  description: text("descripcion"),
  priority: text("prioridad", { enum: ["low", "medium", "high", "critical"] }).notNull(),
  estimatedMinutes: integer("minutos_estimados").notNull(),
  frequency: text("frecuencia", { enum: ["daily", "weekly"] }).notNull(),
  startOn: date("inicia_el", { mode: "string" }).notNull(),
  throughOn: date("hasta_el", { mode: "string" }).notNull(),
  timeZone: text("zona_horaria").notNull(),
  instanceCount: integer("cantidad_instancias").notNull(),
  createdAt: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
});

export const activities = domainSchema.table("actividades", {
  id: uuid("id").primaryKey(),
  sortOrder: bigint("orden", { mode: "bigint" }).notNull().generatedAlwaysAsIdentity(),
  userId: uuid("usuario_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  seriesId: uuid("serie_id").references(() => activitySeries.id, { onDelete: "cascade" }),
  occursOn: date("ocurre_el", { mode: "string" }),
  subjectId: uuid("materia_id"),
  kind: text("tipo", { enum: ["academic_task", "exam", "personal", "routine"] }).notNull(),
  title: varchar("titulo", { length: 240 }).notNull(),
  description: text("descripcion"),
  status: text("estado", { enum: ["backlog", "planned", "in_progress", "completed", "cancelled"] })
    .notNull()
    .default("backlog"),
  priority: text("prioridad", { enum: ["low", "medium", "high", "critical"] })
    .notNull()
    .default("medium"),
  startAfterAt: timestamp("inicio_minimo", { withTimezone: true }),
  deadlineAt: timestamp("fecha_limite", { withTimezone: true }),
  estimatedMinutes: integer("minutos_estimados"),
  progressPercent: smallint("porcentaje_progreso").notNull().default(0),
  completedAt: timestamp("completado_en", { withTimezone: true }),
  archivedAt: timestamp("archivado_en", { withTimezone: true }),
  deletedAt: timestamp("eliminado_en", { withTimezone: true }),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
});

export const activityHistory = domainSchema.table("historial_actividades", {
  id: bigint("id", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid("usuario_id").notNull(),
  activityId: uuid("actividad_id").notNull(),
  mutationId: uuid("mutacion_id").notNull(),
  eventType: text("tipo_evento", {
    enum: ["completed", "reopened", "cancelled", "progress_updated", "deleted"],
  }).notNull(),
  beforeStatus: text("estado_anterior").notNull(),
  afterStatus: text("estado_posterior").notNull(),
  beforeProgress: smallint("progreso_anterior").notNull(),
  afterProgress: smallint("progreso_posterior").notNull(),
  createdAt: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
});

export const subtasks = domainSchema.table("subtareas", {
  id: uuid("id").primaryKey(),
  sortOrder: bigint("orden", { mode: "bigint" }).notNull().generatedAlwaysAsIdentity(),
  userId: uuid("usuario_id").notNull(),
  activityId: uuid("actividad_id").notNull(),
  title: varchar("titulo", { length: 240 }).notNull(),
  estimatedMinutes: integer("minutos_estimados"),
  isCompleted: boolean("completada").notNull().default(false),
  completedAt: timestamp("completado_en", { withTimezone: true }),
  archivedAt: timestamp("archivado_en", { withTimezone: true }),
  lastMutationId: uuid("ultima_mutacion_id"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
});

export const calendarEvents = domainSchema.table("eventos_calendario", {
  id: uuid("id").primaryKey(),
  sortOrder: bigint("orden", { mode: "bigint" }).notNull().generatedAlwaysAsIdentity(),
  userId: uuid("usuario_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  subjectId: uuid("materia_id"),
  kind: text("tipo", {
    enum: ["class", "work", "appointment", "personal", "unavailable", "other"],
  }).notNull(),
  title: varchar("titulo", { length: 200 }).notNull(),
  description: text("descripcion"),
  startsAt: timestamp("inicia_en", { withTimezone: true }).notNull(),
  endsAt: timestamp("termina_en", { withTimezone: true }).notNull(),
  timeZone: varchar("zona_horaria", { length: 64 }).notNull(),
  isLocked: boolean("bloqueado").notNull().default(true),
  source: text("origen", { enum: ["manual"] })
    .notNull()
    .default("manual"),
  archivedAt: timestamp("archivado_en", { withTimezone: true }),
  lastMutationId: uuid("ultima_mutacion_id"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
});

export const availabilityRules = domainSchema.table("reglas_disponibilidad", {
  id: uuid("id").primaryKey(),
  userId: uuid("usuario_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  weekday: smallint("dia_semana").notNull(),
  startMinute: smallint("minuto_inicio").notNull(),
  endMinute: smallint("minuto_fin").notNull(),
  version: integer("version").notNull().default(1),
  archivedAt: timestamp("archivado_en", { withTimezone: true }),
  updatedAt: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
});

export const availabilityExceptions = domainSchema.table("excepciones_disponibilidad", {
  userId: uuid("usuario_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  date: date("fecha", { mode: "string" }).notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
});

export const exceptionWindows = domainSchema.table("ventanas_excepcion", {
  userId: uuid("usuario_id").notNull(),
  date: date("fecha", { mode: "string" }).notNull(),
  position: smallint("posicion").notNull(),
  startMinute: smallint("minuto_inicio").notNull(),
  endMinute: smallint("minuto_fin").notNull(),
});

export const planningRevisions = domainSchema.table("revisiones_planificacion", {
  userId: uuid("usuario_id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  revision: bigint("revision", { mode: "bigint" }).notNull().default(0n),
});

export const plans = domainSchema.table("planes", {
  id: uuid("id").primaryKey(),
  userId: uuid("usuario_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  status: text("estado", { enum: ["draft", "active", "superseded", "rejected"] }).notNull(),
  version: integer("version").notNull().default(1),
  algorithmVersion: text("version_algoritmo").notNull(),
  sourceRevision: bigint("revision_origen", { mode: "bigint" }).notNull(),
  basePlanId: uuid("plan_base_id"),
  from: date("fecha_desde", { mode: "string" }).notNull(),
  through: date("fecha_hasta", { mode: "string" }).notNull(),
  minSessionMinutes: integer("sesion_minima").notNull(),
  maxSessionMinutes: integer("sesion_maxima").notNull(),
  maxDailyMinutes: integer("maximo_diario").notNull(),
  createdAt: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  appliedAt: timestamp("aplicado_en", { withTimezone: true }),
});

export const planBlocks = domainSchema.table("bloques_plan", {
  id: uuid("id").primaryKey(),
  userId: uuid("usuario_id").notNull(),
  planId: uuid("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  activityId: uuid("actividad_id")
    .notNull()
    .references(() => activities.id, { onDelete: "cascade" }),
  startsAt: timestamp("inicia_en", { withTimezone: true }).notNull(),
  endsAt: timestamp("termina_en", { withTimezone: true }).notNull(),
  isLocked: boolean("bloqueado").notNull().default(false),
});

export const unscheduledWork = domainSchema.table("trabajo_no_asignado", {
  userId: uuid("usuario_id").notNull(),
  planId: uuid("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  activityId: uuid("actividad_id")
    .notNull()
    .references(() => activities.id, { onDelete: "cascade" }),
  minutes: integer("minutos").notNull(),
  reason: text("razon", {
    enum: ["deadline_passed", "insufficient_capacity", "below_min_session"],
  }).notNull(),
});

export const planRisks = domainSchema.table("riesgos_plan", {
  userId: uuid("usuario_id").notNull(),
  planId: uuid("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  activityId: uuid("actividad_id")
    .notNull()
    .references(() => activities.id, { onDelete: "cascade" }),
  remainingMinutes: integer("minutos_restantes").notNull(),
  capacityMinutes: integer("minutos_capacidad").notNull(),
  marginMinutes: integer("minutos_margen").notNull(),
  level: text("nivel", { enum: ["low", "medium", "high"] }).notNull(),
  reasons: text("razones").array().notNull(),
});

export const timeEntries = domainSchema.table("registros_tiempo", {
  id: uuid("id").primaryKey(),
  userId: uuid("usuario_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  activityId: uuid("actividad_id")
    .notNull()
    .references(() => activities.id, { onDelete: "cascade" }),
  source: text("origen", { enum: ["timer", "manual"] }).notNull(),
  startsAt: timestamp("inicia_en", { withTimezone: true }).notNull(),
  endsAt: timestamp("termina_en", { withTimezone: true }),
  durationSeconds: integer("duracion_segundos"),
  lastStopMutationId: uuid("ultima_mutacion_cierre"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
});

export const idempotencyKeys = domainSchema.table("claves_idempotencia", {
  userId: uuid("usuario_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  key: uuid("clave").notNull(),
  method: varchar("metodo", { length: 8 }).notNull(),
  path: text("ruta").notNull(),
  requestHash: char("hash_peticion", { length: 64 }).notNull(),
  responseStatus: integer("estado_respuesta"),
  responseBody: jsonb("cuerpo_respuesta"),
  contentType: text("tipo_contenido"),
  leaseOwner: uuid("propietario_arrendamiento"),
  leasedUntil: timestamp("arrendado_hasta", { withTimezone: true }),
  createdAt: timestamp("creada_en", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expira_en", { withTimezone: true }).notNull(),
});

export const outboxEvents = domainSchema.table("bandeja_salida", {
  id: bigint("id", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid("usuario_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  eventType: text("tipo_evento", { enum: ["plan.applied"] }).notNull(),
  planId: uuid("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  status: text("estado", { enum: ["pending", "done", "dead"] })
    .notNull()
    .default("pending"),
  attempts: integer("intentos").notNull().default(0),
  availableAt: timestamp("disponible_en", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("procesado_en", { withTimezone: true }),
  traceId: char("traza_id", { length: 32 }),
  sourceSpanId: char("span_origen_id", { length: 16 }),
});

export const notifications = domainSchema.table("notificaciones", {
  id: uuid("id").primaryKey(),
  userId: uuid("usuario_id")
    .notNull()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  outboxEventId: bigint("evento_salida_id", { mode: "bigint" }).references(() => outboxEvents.id, {
    onDelete: "cascade",
  }),
  type: text("tipo", {
    enum: ["plan_applied", "deadline_reminder", "block_reminder", "risk_alert"],
  }).notNull(),
  planId: uuid("plan_id").references(() => plans.id, { onDelete: "cascade" }),
  activityId: uuid("actividad_id").references(() => activities.id, { onDelete: "cascade" }),
  blockId: uuid("bloque_id").references(() => planBlocks.id, { onDelete: "cascade" }),
  referenceAt: timestamp("referencia_en", { withTimezone: true }),
  readAt: timestamp("leida_en", { withTimezone: true }),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("creada_en", { withTimezone: true }).notNull().defaultNow(),
});
