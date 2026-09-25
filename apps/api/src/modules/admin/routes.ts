import {
  adminAiProviderUpdateSchema,
  adminAiRouteUpdateSchema,
  adminAiUsageSchema,
  adminAuditPageSchema,
  adminAuditSchema,
  adminDocumentCreateSchema,
  adminDocumentPageSchema,
  adminDocumentSchema,
  adminPublishSchema,
  adminRolePageSchema,
  adminRoleRemoveSchema,
  adminRoleSchema,
  adminRoleUpdateSchema,
  adminSystemHealthSchema,
  adminUserPageSchema,
  adminUserSchema,
  adminUserStateSchema,
  adminUserSuspensionSchema,
  aiProviderSchema,
  aiUseCaseSchema,
  dateRangeSchema,
  type Problem,
} from "@notesia/contracts";
import type { AdminDocument, AdminRateLimiter, AdminRepository, AiRepository } from "@notesia/db";
import { evaluateHealthAlerts, type HealthAlertPolicy } from "@notesia/observability";
import type { Hono } from "hono";
import { z } from "zod";
import { type AiFetch, generateWithProvider } from "../ai/adapters";
import { aiCases } from "../ai/cases";
import type { AiKeyCipher } from "../ai/key-cipher";

type Dependencies = {
  getSession(headers: Headers): Promise<{
    user: { id: string };
    session: { createdAt: Date | string };
  } | null>;
  admin: AdminRepository;
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

async function authorize(headers: Headers, method: string, dependencies: Dependencies) {
  const session = await dependencies.getSession(headers);
  if (!session) return { response: error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.") };
  if (!(await dependencies.admin.isAdmin(session.user.id)))
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
  return { userId: session.user.id };
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

export function registerAdminRoutes(app: Hono, dependencies: Dependencies) {
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
        rows.map((row) => ({
          ...row,
          keyConfigured: true,
          updatedAt: row.updatedAt.toISOString(),
        })),
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
      if (!(await dependencies.verifyPassword(c.req.raw.headers, body.data.password)))
        return error(403, "REAUTH_REQUIRED", "Vuelve a confirmar tu contraseña.");
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
      return c.json({ ...result, keyConfigured: true });
    });

    app.get("/v1/admin/ai/routes", async (c) => {
      const access = await authorize(c.req.raw.headers, c.req.method, dependencies);
      if (access.response) return access.response;
      return c.json(await ai.listRoutes());
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
      if (!(await dependencies.verifyPassword(c.req.raw.headers, body.data.password)))
        return error(403, "REAUTH_REQUIRED", "Vuelve a confirmar tu contraseña.");
      const { capabilityReviewed, costReviewed, privacyReviewed, password, ...configuration } =
        body.data;
      void capabilityReviewed;
      void costReviewed;
      void privacyReviewed;
      void password;
      const saved = await ai.upsertRoute(access.userId as string, {
        useCase: useCase.data,
        ...configuration,
      });
      if (!saved) return error(404, "NOT_FOUND", "Proveedor no configurado.");
      return c.json({
        useCase: useCase.data,
        ...configuration,
        alternate: configuration.alternate ?? null,
      });
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
    const access = await authorize(c.req.raw.headers, c.req.method, dependencies);
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
    if (result.kind === "last_admin")
      return error(409, "LAST_ADMIN", "Debe quedar al menos un administrador activo.");
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
          adminAuditSchema.parse({ ...row, recordedAt: row.recordedAt.toISOString() }),
        ),
        nextCursor:
          rows.length > 20 && last
            ? encodeCursor(last.cursorRecordedAt, last.id, "recordedAt")
            : null,
      }),
    );
  });
}
