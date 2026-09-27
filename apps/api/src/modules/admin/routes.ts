import {
  adminAiProviderListSchema,
  adminAiProviderSchema,
  adminAiProviderUpdateSchema,
  adminAiRouteListSchema,
  adminAiRouteSchema,
  adminAiRouteUpdateSchema,
  adminAiUsageSchema,
  adminAnnouncementCreateSchema,
  adminAnnouncementPageSchema,
  adminAnnouncementSchema,
  adminAssistantSuggestionCreateSchema,
  adminAssistantSuggestionListSchema,
  adminAssistantSuggestionSchema,
  adminAssistantSuggestionUpdateSchema,
  adminAuditPageSchema,
  adminAuditSchema,
  adminDocumentCreateSchema,
  adminDocumentPageSchema,
  adminDocumentSchema,
  adminMeSchema,
  adminPublishSchema,
  adminReportDetailSchema,
  adminReportPageSchema,
  adminReportSchema,
  adminReportUpdateSchema,
  adminRolePageSchema,
  adminRoleRemoveSchema,
  adminRoleSchema,
  adminRoleUpdateSchema,
  adminSystemHealthSchema,
  adminUserDetailSchema,
  adminUserPageSchema,
  adminUserSchema,
  adminUserStateSchema,
  adminUserSuspensionSchema,
  aiProviderSchema,
  aiUseCaseSchema,
  dateRangeSchema,
  type Problem,
  reportStatusSchema,
} from "@notesia/contracts";
import type {
  AdminDocument,
  AdminRateLimiter,
  AdminReportRow,
  AdminRepository,
  AiRepository,
  AnnouncementRepository,
  AnnouncementRow,
  AssistantSuggestionRepository,
  ReportRepository,
} from "@notesia/db";
import { computeStreak, todayInTimeZone } from "@notesia/domain";
import { evaluateHealthAlerts, type HealthAlertPolicy } from "@notesia/observability";
import type { Hono } from "hono";
import { z } from "zod";
import { type AiFetch, generateWithProvider } from "../ai/adapters";
import { aiCases } from "../ai/cases";
import type { AiKeyCipher } from "../ai/key-cipher";

type Dependencies = {
  getSession(headers: Headers): Promise<{
    user: { id: string; email?: string };
    session: { createdAt: Date | string };
  } | null>;
  admin: AdminRepository;
  reports?: ReportRepository;
  suggestions?: AssistantSuggestionRepository;
  announcements?: AnnouncementRepository;
  rateLimiter: AdminRateLimiter;
  verifyPassword(headers: Headers, password: string): Promise<boolean>;
  ai?: AiRepository;
  aiKeyCipher?: AiKeyCipher | null;
  aiFetch?: AiFetch;
  allowedOrigin: string;
  alertPolicy?: HealthAlertPolicy;
};

function error(
  status: 401 | 403 | 404 | 409 | 422 | 429 | 503,
  code: string,
  title: string,
  retryAfterSeconds?: number,
) {
  const body: Problem = {
    type: `https://notesia.local/problems/${code.toLowerCase().replaceAll("_", "-")}`,
    title,
    status,
    code,
    requestId: crypto.randomUUID(),
  };
  return Response.json(body, {
    status,
    headers: {
      "Content-Type": "application/problem+json",
      ...(retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {}),
    },
  });
}

type StaffRole = "admin" | "support";
/** Solo administradores, salvo las rutas que también atiende soporte. */
const ADMIN_ONLY: StaffRole[] = ["admin"];
const STAFF: StaffRole[] = ["admin", "support"];

async function authorize(
  headers: Headers,
  method: string,
  dependencies: Dependencies,
  roles: StaffRole[] = ADMIN_ONLY,
) {
  const session = await dependencies.getSession(headers);
  if (!session) return { response: error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.") };
  const role = await dependencies.admin.staffRole(session.user.id);
  if (!role || !roles.includes(role))
    return { response: error(403, "FORBIDDEN", "No tienes permiso para esta operación.") };
  if (
    !(await dependencies.admin.hasFreshMfaSession(
      session.user.id,
      new Date(session.session.createdAt),
    ))
  )
    return { response: error(403, "MFA_REQUIRED", "Inicia sesión con segundo factor.") };
  const rate = await dependencies.rateLimiter.check(session.user.id, method);
  if (!rate.allowed)
    return {
      response: error(
        429,
        "RATE_LIMITED",
        "Demasiadas solicitudes administrativas.",
        rate.retryAfterSeconds,
      ),
    };
  return { userId: session.user.id, email: session.user.email ?? "", role };
}

async function readJson(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return null;
  return request.json().catch(() => null);
}

function cursorFrom<K extends "createdAt" | "recordedAt" | "assignedAt">(
  raw: string | undefined,
  key: K,
): ({ [P in K]: string } & { id: string }) | null {
  if (raw === undefined) return null;
  if (raw.length > 256) throw new Error("Cursor too long");
  const parsed = z
    .strictObject({
      [key]: z.iso.datetime(),
      id: z.uuid(),
    })
    .parse(JSON.parse(Buffer.from(raw, "base64url").toString()));
  return { [key]: parsed[key] as string, id: parsed.id } as {
    [P in K]: string;
  } & { id: string };
}

function encodeCursor(date: string, id: string, key: "createdAt" | "recordedAt" | "assignedAt") {
  return Buffer.from(JSON.stringify({ [key]: date, id })).toString("base64url");
}

function toDocument(row: AdminDocument) {
  const { cursorCreatedAt: _cursorCreatedAt, ...data } = row;
  return adminDocumentSchema.parse({
    ...data,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  });
}

function toAdminReport(row: AdminReportRow) {
  return adminReportSchema.parse({
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    status: row.status,
    reply: row.reply,
    repliedAt: row.repliedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    userId: row.userId,
    userEmail: row.userEmail,
    userName: row.userName,
    assigneeId: row.assigneeId,
    assigneeEmail: row.assigneeEmail,
    context: {
      platform: row.context.platform ?? null,
      osVersion: row.context.osVersion ?? null,
      appVersion: row.context.appVersion ?? null,
    },
    closedAt: row.closedAt?.toISOString() ?? null,
    version: row.version,
  });
}

export function registerAdminRoutes(app: Hono, dependencies: Dependencies) {
  // Quién entró y con qué rol: el panel arma su menú con esto.
  app.get("/v1/admin/me", async (c) => {
    const access = await authorize(c.req.raw.headers, c.req.method, dependencies, STAFF);
    if (access.response) return access.response;
    return c.json(
      adminMeSchema.parse({ userId: access.userId, email: access.email, role: access.role }),
      200,
      { "Cache-Control": "no-store" },
    );
  });

  if (dependencies.suggestions) {
    const suggestions = dependencies.suggestions;
    const toSuggestion = (row: Awaited<ReturnType<typeof suggestions.list>>[number]) =>
      adminAssistantSuggestionSchema.parse({ ...row, updatedAt: row.updatedAt.toISOString() });
    app.get("/v1/admin/assistant-suggestions", async (c) => {
      const access = await authorize(c.req.raw.headers, c.req.method, dependencies);
      if (access.response) return access.response;
      return c.json(
        adminAssistantSuggestionListSchema.parse({
          items: (await suggestions.list()).map(toSuggestion),
        }),
        200,
        { "Cache-Control": "no-store" },
      );
    });
    app.post("/v1/admin/assistant-suggestions", async (c) => {
      const access = await authorize(c.req.raw.headers, c.req.method, dependencies);
      if (access.response) return access.response;
      if (c.req.header("origin") !== dependencies.allowedOrigin)
        return error(403, "FORBIDDEN", "Origen no permitido.");
      const body = adminAssistantSuggestionCreateSchema.safeParse(await readJson(c.req.raw));
      if (!body.success)
        return error(422, "VALIDATION_FAILED", "Escribe una sugerencia de 3 a 120 caracteres.");
      const result = await suggestions.create(access.userId as string, body.data);
      if (result.kind === "duplicate") return error(409, "DUPLICATE", "Esa sugerencia ya existe.");
      return c.json(toSuggestion(result.row), 201);
    });
    app.patch("/v1/admin/assistant-suggestions/:id", async (c) => {
      const access = await authorize(c.req.raw.headers, c.req.method, dependencies);
      if (access.response) return access.response;
      if (c.req.header("origin") !== dependencies.allowedOrigin)
        return error(403, "FORBIDDEN", "Origen no permitido.");
      const id = z.uuid().safeParse(c.req.param("id"));
      const body = adminAssistantSuggestionUpdateSchema.safeParse(await readJson(c.req.raw));
      if (!id.success || !body.success)
        return error(422, "VALIDATION_FAILED", "Escribe una sugerencia de 3 a 120 caracteres.");
      const result = await suggestions.update(access.userId as string, id.data, body.data);
      if (result.kind === "not_found") return error(404, "NOT_FOUND", "Sugerencia no encontrada.");
      if (result.kind === "version_conflict")
        return error(409, "VERSION_CONFLICT", "La sugerencia cambió; actualiza la lista.");
      if (result.kind === "duplicate") return error(409, "DUPLICATE", "Esa sugerencia ya existe.");
      return c.json(toSuggestion(result.row));
    });
    app.delete("/v1/admin/assistant-suggestions/:id", async (c) => {
      const access = await authorize(c.req.raw.headers, c.req.method, dependencies);
      if (access.response) return access.response;
      if (c.req.header("origin") !== dependencies.allowedOrigin)
        return error(403, "FORBIDDEN", "Origen no permitido.");
      const id = z.uuid().safeParse(c.req.param("id"));
      if (!id.success) return error(404, "NOT_FOUND", "Sugerencia no encontrada.");
      const removed = await suggestions.remove(access.userId as string, id.data);
      return removed ? c.body(null, 204) : error(404, "NOT_FOUND", "Sugerencia no encontrada.");
    });
  }

  if (dependencies.announcements) {
    const announcements = dependencies.announcements;
    const toAnnouncement = (row: AnnouncementRow) =>
      adminAnnouncementSchema.parse({
        id: row.id,
        title: row.title,
        body: row.body,
        recipientEmail: row.recipientEmail,
        recipients: row.recipients,
        authorEmail: row.authorEmail,
        createdAt: row.createdAt.toISOString(),
      });
    app.get("/v1/admin/announcements", async (c) => {
      const access = await authorize(c.req.raw.headers, c.req.method, dependencies);
      if (access.response) return access.response;
      let cursor: { createdAt: string; id: string } | null;
      try {
        cursor = cursorFrom(c.req.query("cursor"), "createdAt");
      } catch {
        return error(422, "VALIDATION_FAILED", "Cursor inválido.");
      }
      const rows = await announcements.list(cursor);
      const page = rows.slice(0, 20);
      const last = page.at(-1);
      return c.json(
        adminAnnouncementPageSchema.parse({
          items: page.map(toAnnouncement),
          nextCursor:
            rows.length > 20 && last
              ? encodeCursor(last.cursorCreatedAt, last.id, "createdAt")
              : null,
        }),
        200,
        { "Cache-Control": "no-store" },
      );
    });
    app.post("/v1/admin/announcements", async (c) => {
      const access = await authorize(c.req.raw.headers, c.req.method, dependencies);
      if (access.response) return access.response;
      if (c.req.header("origin") !== dependencies.allowedOrigin)
        return error(403, "FORBIDDEN", "Origen no permitido.");
      const body = adminAnnouncementCreateSchema.safeParse(await readJson(c.req.raw));
      if (!body.success)
        return error(
          422,
          "VALIDATION_FAILED",
          "Escribe un título de hasta 60 caracteres y un mensaje de hasta 300.",
        );
      const result = await announcements.send(access.userId as string, body.data);
      if (result.kind === "recipient_not_found")
        return error(404, "NOT_FOUND", "No hay un estudiante con ese correo.");
      if (result.kind === "conflict")
        return error(409, "CONFLICT", "Ese aviso ya se envió con otro texto.");
      return c.json(toAnnouncement(result.row), 201);
    });
  }

  if (dependencies.reports) {
    const reports = dependencies.reports;
    app.get("/v1/admin/reports", async (c) => {
      const access = await authorize(c.req.raw.headers, c.req.method, dependencies, STAFF);
      if (access.response) return access.response;
      const status = reportStatusSchema.safeParse(c.req.query("status"));
      let cursor: { createdAt: string; id: string } | null;
      try {
        cursor = cursorFrom(c.req.query("cursor"), "createdAt");
      } catch {
        return error(422, "VALIDATION_FAILED", "Cursor inválido.");
      }
      const rows = await reports.adminList(status.success ? status.data : null, cursor);
      const page = rows.slice(0, 20);
      const last = page.at(-1);
      return c.json(
        adminReportPageSchema.parse({
          items: page.map(toAdminReport),
          nextCursor:
            rows.length > 20 && last
              ? encodeCursor(last.cursorCreatedAt, last.id, "createdAt")
              : null,
        }),
        200,
        { "Cache-Control": "no-store" },
      );
    });

    app.get("/v1/admin/reports/:reportId", async (c) => {
      const access = await authorize(c.req.raw.headers, c.req.method, dependencies, STAFF);
      if (access.response) return access.response;
      const id = z.uuid().safeParse(c.req.param("reportId"));
      if (!id.success) return error(404, "NOT_FOUND", "Reporte no encontrado.");
      const row = await reports.adminGet(id.data);
      if (!row) return error(404, "NOT_FOUND", "Reporte no encontrado.");
      return c.json(
        adminReportDetailSchema.parse({
          ...toAdminReport(row),
          history: row.history.map((item) => ({
            action: item.action,
            actorEmail: item.actorEmail,
            detail: item.detail,
            recordedAt: item.recordedAt.toISOString(),
          })),
        }),
        200,
        { "Cache-Control": "no-store" },
      );
    });

    app.patch("/v1/admin/reports/:reportId", async (c) => {
      const access = await authorize(c.req.raw.headers, c.req.method, dependencies, STAFF);
      if (access.response) return access.response;
      if (c.req.header("origin") !== dependencies.allowedOrigin)
        return error(403, "FORBIDDEN", "Origen no permitido.");
      const id = z.uuid().safeParse(c.req.param("reportId"));
      const body = adminReportUpdateSchema.safeParse(await readJson(c.req.raw));
      if (!id.success || !body.success)
        return error(422, "VALIDATION_FAILED", "Cambio de reporte inválido.");
      const result = await reports.adminUpdate(access.userId as string, id.data, body.data);
      if (result.kind === "not_found") return error(404, "NOT_FOUND", "Reporte no encontrado.");
      if (result.kind === "version_conflict")
        return error(409, "VERSION_CONFLICT", "El reporte cambió; actualízalo.");
      const row = await reports.adminGet(id.data);
      if (!row) return error(404, "NOT_FOUND", "Reporte no encontrado.");
      return c.json(toAdminReport(row));
    });
  }

  app.get("/v1/admin/system-health", async (c) => {
    const access = await authorize(c.req.raw.headers, c.req.method, dependencies);
    if (access.response) return access.response;
    const health = await dependencies.admin.systemHealth();
    const alerts = evaluateHealthAlerts(health, new Date(), dependencies.alertPolicy);
    return c.json(
      adminSystemHealthSchema.parse({
        database: "ready",
        checkedAt: new Date().toISOString(),
        ...health,
        alerts,
      }),
      200,
      { "Cache-Control": "no-store" },
    );
  });
  if (dependencies.ai) {
    const ai = dependencies.ai;
    app.get("/v1/admin/ai/usage", async (c) => {
      const access = await authorize(c.req.raw.headers, c.req.method, dependencies);
      if (access.response) return access.response;
      const range = dateRangeSchema.safeParse({
        from: c.req.query("from"),
        through: c.req.query("through"),
      });
      if (!range.success) return error(422, "VALIDATION_FAILED", "Rango de fechas inválido.");
      const from = Date.parse(`${range.data.from}T00:00:00.000Z`);
      const through = Date.parse(`${range.data.through}T00:00:00.000Z`);
      if (through <= from || through - from > 31 * 24 * 60 * 60 * 1000)
        return error(422, "VALIDATION_FAILED", "El rango debe ser de hasta 31 días.");
      return c.json(
        adminAiUsageSchema.parse({
          ...range.data,
          fallbacks: await ai.fallbackSummary(range.data.from, range.data.through),
          transitions: await ai.transitionSummary(range.data.from, range.data.through),
          items: await ai.usageSummary(range.data.from, range.data.through),
        }),
      );
    });
    app.get("/v1/admin/ai/providers", async (c) => {
      const access = await authorize(c.req.raw.headers, c.req.method, dependencies);
      if (access.response) return access.response;
      const rows = await ai.listProviders();
      return c.json(
        adminAiProviderListSchema.parse(
          rows.map((row) => ({
            ...row,
            keyConfigured: true,
            updatedAt: row.updatedAt.toISOString(),
          })),
        ),
      );
    });

    app.put("/v1/admin/ai/providers/:provider", async (c) => {
      const access = await authorize(c.req.raw.headers, c.req.method, dependencies);
      if (access.response) return access.response;
      if (c.req.header("origin") !== dependencies.allowedOrigin)
        return error(403, "FORBIDDEN", "Origen no permitido.");
      const provider = aiProviderSchema.safeParse(c.req.param("provider"));
      const body = adminAiProviderUpdateSchema.safeParse(await readJson(c.req.raw));
      if (!provider.success || !body.success)
        return error(422, "VALIDATION_FAILED", "Configuración inválida.");
      if (!dependencies.aiKeyCipher)
        return error(503, "SERVICE_UNAVAILABLE", "Falta la clave de cifrado de IA.");
      const encrypted = body.data.apiKey
        ? dependencies.aiKeyCipher.encrypt(provider.data, body.data.apiKey)
        : null;
      const result = await ai.upsertProvider(
        access.userId as string,
        provider.data,
        encrypted,
        body.data.enabled,
      );
      if (!result) return error(422, "VALIDATION_FAILED", "La conexión nueva requiere una clave.");
      return c.json(adminAiProviderSchema.parse({ ...result, keyConfigured: true }));
    });

    app.get("/v1/admin/ai/routes", async (c) => {
      const access = await authorize(c.req.raw.headers, c.req.method, dependencies);
      if (access.response) return access.response;
      return c.json(adminAiRouteListSchema.parse(await ai.listRoutes()));
    });

    app.put("/v1/admin/ai/routes/:useCase", async (c) => {
      const access = await authorize(c.req.raw.headers, c.req.method, dependencies);
      if (access.response) return access.response;
      if (c.req.header("origin") !== dependencies.allowedOrigin)
        return error(403, "FORBIDDEN", "Origen no permitido.");
      const useCase = aiUseCaseSchema.safeParse(c.req.param("useCase"));
      const body = adminAiRouteUpdateSchema.safeParse(await readJson(c.req.raw));
      if (!useCase.success || !body.success)
        return error(422, "VALIDATION_FAILED", "Ruta de IA inválida.");
      const configuration = body.data;
      const saved = await ai.upsertRoute(access.userId as string, {
        useCase: useCase.data,
        ...configuration,
      });
      if (!saved) return error(404, "NOT_FOUND", "Proveedor no configurado.");
      return c.json(
        adminAiRouteSchema.parse({
          useCase: useCase.data,
          ...configuration,
          alternate: configuration.alternate ?? null,
        }),
      );
    });

    app.post("/v1/admin/ai/routes/:useCase/test", async (c) => {
      const access = await authorize(c.req.raw.headers, c.req.method, dependencies);
      if (access.response) return access.response;
      if (c.req.header("origin") !== dependencies.allowedOrigin)
        return error(403, "FORBIDDEN", "Origen no permitido.");
      const useCase = aiUseCaseSchema.safeParse(c.req.param("useCase"));
      if (!useCase.success) return error(404, "NOT_FOUND", "Ruta de IA no encontrada.");
      if (!dependencies.aiKeyCipher)
        return error(503, "SERVICE_UNAVAILABLE", "Falta la clave de cifrado de IA.");
      const route = await ai.adminRoute(useCase.data);
      if (!route) return error(404, "NOT_FOUND", "Ruta de IA no encontrada.");
      const alternate = await ai.adminAlternateRoute(useCase.data);
      const synthetic = {
        extract_activity: { text: "Preparar un resumen de biología" },
        estimate_duration: { description: "Resumir diez páginas de biología" },
        explain_risk: {
          level: "medium",
          remainingMinutes: 120,
          availableMinutes: 90,
          deadlineHours: 48,
        },
        explain_replan: {
          movedBlocks: 2,
          addedBlocks: 1,
          removedBlocks: 0,
          unscheduledMinutes: 20,
        },
        propose_subtasks: { description: "Preparar una exposición de biología" },
        assistant_chat: {
          message: "Tengo examen de biología el viernes a las 10, prioridad alta",
          history: [],
          now: "2026-01-05T09:00:00-05:00 (lunes)",
          timeZone: "America/Guayaquil",
          results: null,
        },
        onboarding_setup: {
          message:
            "Tengo clases de cálculo lunes y miércoles de 7 a 9 y puedo estudiar en las tardes",
          history: [],
          today: "2026-01-05 (lunes)",
          draft: { studyHours: [], maxDailyMinutes: null, commitments: [] },
        },
      }[useCase.data];
      try {
        const spec = aiCases[useCase.data];
        for (const selected of [route, alternate].filter((item) => item !== null)) {
          const result = await generateWithProvider(
            {
              provider: selected.provider,
              modelId: selected.modelId,
              apiKey: dependencies.aiKeyCipher.decrypt(selected.provider, selected.encryptedKey),
              timeoutMs: selected.timeoutMs,
              maxOutputTokens: selected.maxOutputTokens,
            },
            useCase.data,
            spec.instruction,
            spec.jsonSchema,
            synthetic,
            dependencies.aiFetch,
          );
          if (!spec.output.safeParse(JSON.parse(result.text)).success)
            return error(503, "AI_UNAVAILABLE", "El proveedor devolvió una respuesta inválida.");
          await ai.recordTest(access.userId as string, selected.provider);
        }
      } catch {
        return error(503, "AI_UNAVAILABLE", "No se pudo verificar el proveedor.");
      }
      return c.json({ ok: true });
    });
  }

  app.get("/v1/admin/users", async (c) => {
    const access = await authorize(c.req.raw.headers, c.req.method, dependencies, STAFF);
    if (access.response) return access.response;
    let cursor: { createdAt: string; id: string } | null;
    try {
      cursor = cursorFrom(c.req.query("cursor"), "createdAt");
    } catch {
      return error(422, "VALIDATION_FAILED", "Cursor inválido.");
    }
    const rows = await dependencies.admin.listUsers(cursor);
    const page = rows.slice(0, 20);
    const last = page.at(-1);
    return c.json(
      adminUserPageSchema.parse({
        items: page.map((row) =>
          adminUserSchema.parse({
            id: row.id,
            email: row.email,
            name: row.name,
            role: row.role,
            suspendedAt: row.suspendedAt?.toISOString() ?? null,
            version: row.version,
            createdAt: row.createdAt.toISOString(),
          }),
        ),
        nextCursor:
          rows.length > 20 && last
            ? encodeCursor(last.cursorCreatedAt, last.id, "createdAt")
            : null,
      }),
      200,
      { "Cache-Control": "no-store" },
    );
  });

  app.get("/v1/admin/users/:userId", async (c) => {
    const access = await authorize(c.req.raw.headers, c.req.method, dependencies, STAFF);
    if (access.response) return access.response;
    const userId = z.uuid().safeParse(c.req.param("userId"));
    if (!userId.success) return error(404, "NOT_FOUND", "Cuenta no encontrada.");
    const row = await dependencies.admin.userDetail(userId.data);
    if (!row) return error(404, "NOT_FOUND", "Cuenta no encontrada.");
    const today = row.timeZone
      ? todayInTimeZone(new Date().toISOString(), row.timeZone)
      : new Date().toISOString().slice(0, 10);
    return c.json(
      adminUserDetailSchema.parse({
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        suspendedAt: row.suspendedAt?.toISOString() ?? null,
        version: row.version,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        emailVerified: row.emailVerified,
        twoFactorEnabled: row.twoFactorEnabled,
        profile: row.hasProfile
          ? {
              displayName: row.displayName ?? "",
              timeZone: row.timeZone ?? "",
              avatar: row.avatar ?? "",
              onboardingCompleted: row.onboardingCompletedAt !== null,
            }
          : null,
        counts: {
          activities: row.activities,
          completedActivities: row.completedActivities,
          commitments: row.commitments,
          studyHours: row.studyHours,
          pushDevices: row.pushDevices,
          streakDays: computeStreak(row.streakDays, today, row.streakRestDays).current,
        },
        deletionRequestedAt: row.deletionRequestedAt?.toISOString() ?? null,
      }),
      200,
      { "Cache-Control": "no-store" },
    );
  });

  app.put("/v1/admin/users/:userId/suspension", async (c) => {
    const access = await authorize(c.req.raw.headers, c.req.method, dependencies);
    if (access.response) return access.response;
    if (c.req.header("origin") !== dependencies.allowedOrigin)
      return error(403, "FORBIDDEN", "Origen no permitido.");
    const userId = z.uuid().safeParse(c.req.param("userId"));
    const body = adminUserSuspensionSchema.safeParse(await readJson(c.req.raw));
    if (!userId.success || !body.success)
      return error(422, "VALIDATION_FAILED", "Cambio de estado inválido.");
    if (!(await dependencies.verifyPassword(c.req.raw.headers, body.data.password)))
      return error(403, "REAUTH_REQUIRED", "Vuelve a confirmar tu contraseña.");
    const result = await dependencies.admin.setSuspended(
      access.userId as string,
      userId.data,
      body.data.suspended,
      body.data.version,
    );
    if (result.kind === "not_found") return error(404, "NOT_FOUND", "Cuenta no encontrada.");
    if (result.kind === "version_conflict")
      return error(409, "VERSION_CONFLICT", "La cuenta cambió; actualiza la lista.");
    if (result.kind === "self_change")
      return error(403, "FORBIDDEN", "No puedes suspender tu propia cuenta.");
    if (result.kind === "admin_target")
      return error(
        403,
        "FORBIDDEN",
        "No se puede suspender a un administrador. Quítale el rol primero.",
      );
    return c.json(
      adminUserStateSchema.parse({
        userId: userId.data,
        version: result.version,
        suspendedAt: result.suspendedAt?.toISOString() ?? null,
      }),
    );
  });

  app.get("/v1/admin/roles", async (c) => {
    const access = await authorize(c.req.raw.headers, c.req.method, dependencies);
    if (access.response) return access.response;
    let cursor: { assignedAt: string; id: string } | null;
    try {
      cursor = cursorFrom(c.req.query("cursor"), "assignedAt");
    } catch {
      return error(422, "VALIDATION_FAILED", "Cursor inválido.");
    }
    const rows = await dependencies.admin.listRoles(cursor);
    const page = rows.slice(0, 20);
    const last = page.at(-1);
    return c.json(
      adminRolePageSchema.parse({
        items: page.map((row) =>
          adminRoleSchema.parse({
            ...row,
            assignedAt: row.assignedAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
          }),
        ),
        nextCursor:
          rows.length > 20 && last
            ? encodeCursor(last.cursorAssignedAt, last.userId, "assignedAt")
            : null,
      }),
    );
  });

  app.put("/v1/admin/roles/:userId", async (c) => {
    const access = await authorize(c.req.raw.headers, c.req.method, dependencies);
    if (access.response) return access.response;
    if (c.req.header("origin") !== dependencies.allowedOrigin)
      return error(403, "FORBIDDEN", "Origen no permitido.");
    const userId = z.uuid().safeParse(c.req.param("userId"));
    const body = adminRoleUpdateSchema.safeParse(await readJson(c.req.raw));
    if (!userId.success || !body.success)
      return error(422, "VALIDATION_FAILED", "Asignación inválida.");
    if (!(await dependencies.verifyPassword(c.req.raw.headers, body.data.password)))
      return error(403, "REAUTH_REQUIRED", "Vuelve a confirmar tu contraseña.");
    const result = await dependencies.admin.assignRole(
      access.userId as string,
      userId.data,
      body.data.role,
      body.data.version,
    );
    if (result.kind === "not_found") return error(404, "NOT_FOUND", "Cuenta no encontrada.");
    if (result.kind === "version_conflict")
      return error(409, "VERSION_CONFLICT", "El rol cambió; actualiza la lista.");
    if (result.kind === "self_change")
      return error(403, "FORBIDDEN", "No puedes retirar tu propio acceso.");
    if (result.kind === "last_admin")
      return error(409, "LAST_ADMIN", "Debe quedar al menos un administrador.");
    return c.json({ userId: userId.data, role: body.data.role, version: result.version });
  });

  app.delete("/v1/admin/roles/:userId", async (c) => {
    const access = await authorize(c.req.raw.headers, c.req.method, dependencies);
    if (access.response) return access.response;
    if (c.req.header("origin") !== dependencies.allowedOrigin)
      return error(403, "FORBIDDEN", "Origen no permitido.");
    const userId = z.uuid().safeParse(c.req.param("userId"));
    const body = adminRoleRemoveSchema.safeParse(await readJson(c.req.raw));
    if (!userId.success || !body.success)
      return error(422, "VALIDATION_FAILED", "Revocación inválida.");
    if (!(await dependencies.verifyPassword(c.req.raw.headers, body.data.password)))
      return error(403, "REAUTH_REQUIRED", "Vuelve a confirmar tu contraseña.");
    const result = await dependencies.admin.removeRole(
      access.userId as string,
      userId.data,
      body.data.version,
    );
    if (result.kind === "not_found") return error(404, "NOT_FOUND", "Rol no encontrado.");
    if (result.kind === "version_conflict")
      return error(409, "VERSION_CONFLICT", "El rol cambió; actualiza la lista.");
    if (result.kind === "self_change")
      return error(403, "FORBIDDEN", "No puedes retirar tu propio acceso.");
    if (result.kind === "last_admin")
      return error(409, "LAST_ADMIN", "Debe quedar al menos un administrador.");
    return c.json({ userId: userId.data, removed: true });
  });

  app.get("/v1/admin/privacy-documents", async (c) => {
    const access = await authorize(c.req.raw.headers, c.req.method, dependencies);
    if (access.response) return access.response;
    let cursor: { createdAt: string; id: string } | null;
    try {
      cursor = cursorFrom(c.req.query("cursor"), "createdAt");
    } catch {
      return error(422, "VALIDATION_FAILED", "Cursor inválido.");
    }
    const rows = await dependencies.admin.listDocuments(cursor);
    const page = rows.slice(0, 20);
    const last = page.at(-1);
    return c.json(
      adminDocumentPageSchema.parse({
        items: page.map(toDocument),
        nextCursor:
          rows.length > 20 && last
            ? encodeCursor(last.cursorCreatedAt, last.id, "createdAt")
            : null,
      }),
    );
  });

  app.post("/v1/admin/privacy-documents", async (c) => {
    const access = await authorize(c.req.raw.headers, c.req.method, dependencies);
    if (access.response) return access.response;
    if (c.req.header("origin") !== dependencies.allowedOrigin)
      return error(403, "FORBIDDEN", "Origen no permitido.");
    const parsed = adminDocumentCreateSchema.safeParse(await readJson(c.req.raw));
    if (!parsed.success) return error(422, "VALIDATION_FAILED", "Documento inválido.");
    const result = await dependencies.admin.createDocument(access.userId as string, parsed.data);
    if (result.kind === "version_conflict")
      return error(409, "VERSION_CONFLICT", "La versión del documento ya existe.");
    return c.json(toDocument(result.row), 201);
  });

  app.post("/v1/admin/privacy-documents/:id/publish", async (c) => {
    const access = await authorize(c.req.raw.headers, c.req.method, dependencies);
    if (access.response) return access.response;
    if (c.req.header("origin") !== dependencies.allowedOrigin)
      return error(403, "FORBIDDEN", "Origen no permitido.");
    const id = c.req.param("id");
    if (!z.uuid().safeParse(id).success) return error(404, "NOT_FOUND", "Documento no encontrado.");
    const parsed = adminPublishSchema.safeParse(await readJson(c.req.raw));
    if (!parsed.success) return error(422, "VALIDATION_FAILED", "Confirma la publicación.");
    const result = await dependencies.admin.publishDocument(access.userId as string, id);
    if (result.kind === "not_found") return error(404, "NOT_FOUND", "Documento no encontrado.");
    if (result.kind === "version_conflict")
      return error(409, "VERSION_CONFLICT", "Hay una versión publicada más reciente.");
    return c.json(toDocument(result.row));
  });

  app.get("/v1/admin/audit", async (c) => {
    const access = await authorize(c.req.raw.headers, c.req.method, dependencies);
    if (access.response) return access.response;
    let cursor: { recordedAt: string; id: string } | null;
    try {
      cursor = cursorFrom(c.req.query("cursor"), "recordedAt");
    } catch {
      return error(422, "VALIDATION_FAILED", "Cursor inválido.");
    }
    const rows = await dependencies.admin.listAudit(cursor);
    const page = rows.slice(0, 20);
    const last = page.at(-1);
    return c.json(
      adminAuditPageSchema.parse({
        items: page.map((row) =>
          adminAuditSchema.parse({
            id: row.id,
            actorId: row.actorId,
            action: row.action,
            targetId: row.targetId,
            actorEmail: row.actorEmail,
            target: row.targetEmail
              ? { kind: "user", email: row.targetEmail }
              : row.documentType && row.documentVersion
                ? { kind: "document", type: row.documentType, version: row.documentVersion }
                : row.provider
                  ? { kind: "provider", provider: row.provider }
                  : row.suggestion
                    ? { kind: "suggestion", text: row.suggestion }
                    : row.announcement
                      ? { kind: "announcement", title: row.announcement }
                      : null,
            recordedAt: row.recordedAt.toISOString(),
          }),
        ),
        nextCursor:
          rows.length > 20 && last
            ? encodeCursor(last.cursorRecordedAt, last.id, "recordedAt")
            : null,
      }),
    );
  });
}
