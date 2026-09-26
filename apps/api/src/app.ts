import { createHash } from "node:crypto";
import { healthSchema, type Problem, readinessSchema } from "@notesia/contracts";
import type {
  AccountDeletionRepository,
  AccountExportRepository,
  ActivityRepository,
  ActivitySeriesRepository,
  AdminRateLimiter,
  AdminRepository,
  AiContextRepository,
  AiRepository,
  AvailabilityRepository,
  CalendarEventRepository,
  IdempotencyRepository,
  NotificationPreferenceRepository,
  NotificationRepository,
  PlanRepository,
  PreferenceRepository,
  PrivacyRepository,
  ProfileRepository,
  PushDeviceRepository,
  PushTokenCipher,
  ReportRepository,
  SubtaskRepository,
  TimeEntryRepository,
} from "@notesia/db";
import {
  createTraceContext,
  formatTraceparent,
  type HealthAlertPolicy,
  type HttpObservation,
  httpArea,
  parseTraceparent,
  runWithTraceContext,
  type TraceObservation,
} from "@notesia/observability";
import { Hono } from "hono";
import { z } from "zod";
import { supportedAuthRoutes } from "./auth/supported-routes";
import { registerAccountDeletionRoutes } from "./modules/account-deletion/routes";
import { registerAccountExportRoutes } from "./modules/account-export/routes";
import { registerActivityRoutes } from "./modules/activities/routes";
import { registerActivitySeriesRoutes } from "./modules/activity-series/routes";
import { registerAdminRoutes } from "./modules/admin/routes";
import type { AiFetch } from "./modules/ai/adapters";
import type { AiGateway } from "./modules/ai/gateway";
import type { AiKeyCipher } from "./modules/ai/key-cipher";
import { registerAiRoutes } from "./modules/ai/routes";
import { registerAvailabilityRoutes } from "./modules/availability/routes";
import { registerCalendarEventRoutes } from "./modules/calendar-events/routes";
import { registerMeRoutes } from "./modules/me/routes";
import { registerNotificationRoutes } from "./modules/notifications/routes";
import { registerPlanRoutes } from "./modules/plans/routes";
import { registerPrivacyRoutes } from "./modules/privacy/routes";
import { registerPushDeviceRoutes } from "./modules/push-devices/routes";
import { registerReportRoutes } from "./modules/reports/routes";
import { registerSubtaskRoutes } from "./modules/subtasks/routes";
import { registerTimeEntryRoutes } from "./modules/time-entries/routes";

type AuthHandler = (request: Request) => Promise<Response>;
const authOperationSet = new Set(
  supportedAuthRoutes.map(({ method, path }) => `${method} ${path}`),
);
type Session = { user: { id: string; email: string } };
type MeDependencies = {
  getSession(headers: Headers): Promise<Session | null>;
  profiles: ProfileRepository;
  preferences?: PreferenceRepository;
};
type ActivityDependencies = {
  getSession(headers: Headers): Promise<Session | null>;
  activities: ActivityRepository;
  profiles: ProfileRepository;
};
type ActivitySeriesDependencies = {
  getSession(headers: Headers): Promise<Session | null>;
  series: ActivitySeriesRepository;
  profiles: ProfileRepository;
};
type SubtaskDependencies = {
  getSession(headers: Headers): Promise<Session | null>;
  activities: ActivityRepository;
  subtasks: SubtaskRepository;
};
type CalendarEventDependencies = {
  getSession(headers: Headers): Promise<Session | null>;
  events: CalendarEventRepository;
  profiles: ProfileRepository;
};
type AvailabilityDependencies = {
  getSession(headers: Headers): Promise<Session | null>;
  availability: AvailabilityRepository;
  events: CalendarEventRepository;
  profiles: ProfileRepository;
};
type PlanDependencies = {
  getSession(headers: Headers): Promise<Session | null>;
  plans: PlanRepository;
  preferences: PreferenceRepository;
  timeEntries: TimeEntryRepository;
  activities: ActivityRepository;
  availability: AvailabilityRepository;
  events: CalendarEventRepository;
  profiles: ProfileRepository;
  now?(): Date;
};
type TimeEntryDependencies = {
  getSession(headers: Headers): Promise<Session | null>;
  timeEntries: TimeEntryRepository;
  activities: ActivityRepository;
  profiles: ProfileRepository;
  now?(): Date;
};
type IdempotencyDependencies = {
  getSession(headers: Headers): Promise<Session | null>;
  idempotency: IdempotencyRepository;
  withTransaction<T>(action: () => Promise<T>): Promise<T>;
};
class IdempotencyRollback extends Error {}
type NotificationDependencies = {
  getSession(headers: Headers): Promise<Session | null>;
  notifications: NotificationRepository;
  preferences?: NotificationPreferenceRepository;
};
type PrivacyDependencies = {
  getSession(headers: Headers): Promise<Session | null>;
  privacy: PrivacyRepository;
};
type AdminDependencies = {
  getSession(headers: Headers): Promise<{
    user: { id: string; email?: string };
    session: { createdAt: Date | string };
  } | null>;
  admin: AdminRepository;
  reports?: ReportRepository;
  rateLimiter: AdminRateLimiter;
  verifyPassword(headers: Headers, password: string): Promise<boolean>;
  ai?: AiRepository;
  aiKeyCipher?: AiKeyCipher | null;
  aiFetch?: AiFetch;
  allowedOrigin: string;
  alertPolicy?: HealthAlertPolicy;
};
type AiDependencies = {
  getSession(headers: Headers): Promise<Session | null>;
  gateway: AiGateway;
  context: AiContextRepository;
};
type AccountExportDependencies = {
  getSession(headers: Headers): Promise<Session | null>;
  verifyPassword(headers: Headers, password: string): Promise<boolean>;
  exports: AccountExportRepository;
};
type PushDependencies = {
  getSession(headers: Headers): Promise<Session | null>;
  devices: PushDeviceRepository;
  cipher: PushTokenCipher | null;
};
type AccountDeletionDependencies = {
  getSession(headers: Headers): Promise<Session | null>;
  verifyPassword(headers: Headers, password: string): Promise<boolean>;
  deletions: AccountDeletionRepository | null;
};

export function createApp(
  checkDatabase: () => Promise<void>,
  authHandler?: AuthHandler,
  meDependencies?: MeDependencies,
  activityDependencies?: ActivityDependencies,
  subtaskDependencies?: SubtaskDependencies,
  calendarEventDependencies?: CalendarEventDependencies,
  availabilityDependencies?: AvailabilityDependencies,
  planDependencies?: PlanDependencies,
  timeEntryDependencies?: TimeEntryDependencies,
  idempotencyDependencies?: IdempotencyDependencies,
  notificationDependencies?: NotificationDependencies,
  privacyDependencies?: PrivacyDependencies,
  adminDependencies?: AdminDependencies,
  aiDependencies?: AiDependencies,
  accountExportDependencies?: AccountExportDependencies,
  pushDependencies?: PushDependencies,
  accountDeletionDependencies?: AccountDeletionDependencies,
  activitySeriesDependencies?: ActivitySeriesDependencies,
  observeHttp?: (event: HttpObservation) => void,
  observeTrace?: (event: TraceObservation) => void,
) {
  const app = new Hono();
  const requestIds = new WeakMap<Request, string>();
  const requestIdFor = (request: Request) => requestIds.get(request) ?? crypto.randomUUID();

  app.onError((_caught, c) => {
    const requestId = requestIdFor(c.req.raw);
    const response: Problem = {
      type: "https://notesia.local/problems/internal-error",
      title: "Ocurrió un error inesperado.",
      status: 500,
      code: "INTERNAL_ERROR",
      requestId,
    };
    return Response.json(response, {
      status: 500,
      headers: { "Content-Type": "application/problem+json", "X-Request-Id": requestId },
    });
  });

  app.notFound((c) => {
    const requestId = requestIdFor(c.req.raw);
    const response: Problem = {
      type: "https://notesia.local/problems/not-found",
      title: "Ruta no encontrada.",
      status: 404,
      code: "NOT_FOUND",
      requestId,
    };
    return Response.json(response, {
      status: 404,
      headers: { "Content-Type": "application/problem+json", "X-Request-Id": requestId },
    });
  });

  app.use("/v1/*", async (c, next) => {
    const started = performance.now();
    const generatedId = crypto.randomUUID();
    const trace = createTraceContext(parseTraceparent(c.req.header("traceparent")));
    requestIds.set(c.req.raw, generatedId);
    let requestId: string = generatedId;
    let status = 500;
    return runWithTraceContext(trace, async () => {
      try {
        await next();
        status = c.res.status;
        if (c.res.headers.get("content-type")?.startsWith("application/problem+json")) {
          const body = (await c.res
            .clone()
            .json()
            .catch(() => null)) as { requestId?: unknown } | null;
          if (typeof body?.requestId === "string" && body.requestId.length <= 128)
            requestId = body.requestId;
        }
        c.header("X-Request-Id", requestId);
        c.header("traceparent", formatTraceparent(trace));
      } finally {
        const durationMs = Math.max(0, Math.round(performance.now() - started));
        try {
          observeHttp?.({
            requestId,
            traceId: trace.traceId,
            method: c.req.method.toUpperCase(),
            area: httpArea(c.req.path),
            status,
            durationMs,
          });
        } catch {
          console.warn("HTTP observation failed");
        }
        try {
          observeTrace?.({
            ...trace,
            name: "api.request",
            component: "api",
            outcome: status >= 500 ? "error" : "ok",
            durationMs,
          });
        } catch {
          console.warn("Trace observation failed");
        }
      }
    });
  });

  app.use("/v1/*", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
  });

  app.use("/v1/*", async (c, next) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method.toUpperCase())) return next();
    const tooLarge = () =>
      Response.json(
        {
          type: "https://notesia.local/problems/payload-too-large",
          title: "La solicitud es demasiado grande.",
          status: 413,
          code: "PAYLOAD_TOO_LARGE",
          requestId: crypto.randomUUID(),
        } satisfies Problem,
        { status: 413, headers: { "Content-Type": "application/problem+json" } },
      );
    const maxBytes = 131072;
    const declaredLength = Number(c.req.header("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return tooLarge();
    const reader = c.req.raw.clone().body?.getReader();
    if (reader) {
      let seen = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          seen += part.value.byteLength;
          if (seen > maxBytes) return tooLarge();
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
    }
    return next();
  });

  // Con una versión nueva de términos o privacidad sin aceptar, la app no se usa
  // hasta aceptarla. Quedan libres la sesión, leer y aceptar documentos, el
  // perfil que muestra la app, exportar y pedir la eliminación de la cuenta.
  if (privacyDependencies)
    app.use("/v1/*", async (c, next) => {
      const path = c.req.path;
      if (
        path === "/v1/health" ||
        path === "/v1/me" ||
        path === "/v1/me/export" ||
        path === "/v1/me/deletion-request" ||
        path.startsWith("/v1/auth/") ||
        path.startsWith("/v1/admin/") ||
        path.startsWith("/v1/privacy/") ||
        path.startsWith("/v1/me/consents") ||
        path.startsWith("/v1/me/push-devices")
      )
        return next();
      const session = await privacyDependencies.getSession(c.req.raw.headers);
      if (!session) return next();
      if (!(await privacyDependencies.privacy.missingRequired(session.user.id, "es")))
        return next();
      return c.json(
        {
          type: "https://notesia.local/problems/consent-required",
          title: "Acepta la versión vigente de los términos para continuar.",
          status: 403,
          code: "CONSENT_REQUIRED",
          requestId: requestIdFor(c.req.raw),
        } satisfies Problem,
        403,
        { "Content-Type": "application/problem+json" },
      );
    });

  if (idempotencyDependencies)
    app.use("/v1/*", async (c, next) => {
      const method = c.req.method.toUpperCase();
      const key = c.req.header("Idempotency-Key");
      if (
        !["POST", "PATCH", "PUT", "DELETE"].includes(method) ||
        !key ||
        c.req.path.startsWith("/v1/auth/") ||
        c.req.path.startsWith("/v1/admin/") ||
        c.req.path.startsWith("/v1/ai/") ||
        c.req.path.startsWith("/v1/me/consents") ||
        c.req.path === "/v1/me/export" ||
        c.req.path === "/v1/me/deletion-request"
      )
        return next();
      const problem = (status: 409 | 422, code: string, title: string) =>
        c.json(
          {
            type: `https://notesia.local/problems/${code.toLowerCase().replaceAll("_", "-")}`,
            title,
            status,
            code,
            requestId: crypto.randomUUID(),
          } satisfies Problem,
          status,
          { "Content-Type": "application/problem+json" },
        );
      if (!z.uuid().safeParse(key).success)
        return problem(422, "VALIDATION_FAILED", "Idempotency-Key debe ser un UUID.");
      const session = await idempotencyDependencies.getSession(c.req.raw.headers);
      if (!session) return next();
      const body = await c.req.raw.clone().arrayBuffer();
      if (body.byteLength > 131072)
        return problem(422, "VALIDATION_FAILED", "Solicitud demasiado grande.");
      const path = new URL(c.req.url).pathname + new URL(c.req.url).search;
      const claim = {
        userId: session.user.id,
        key,
        method,
        path,
        hash: createHash("sha256").update(new Uint8Array(body)).digest("hex"),
      };
      const result = await idempotencyDependencies.idempotency.claim(claim);
      if (result.kind === "conflict")
        return problem(409, "VERSION_CONFLICT", "La clave ya se usó con otra solicitud.");
      if (result.kind === "pending")
        return problem(409, "VERSION_CONFLICT", "La solicitud anterior sigue en proceso.");
      if (result.kind === "replayed")
        return new Response(result.status === 204 ? null : JSON.stringify(result.body), {
          status: result.status,
          headers:
            result.status === 204
              ? undefined
              : { "Content-Type": result.contentType ?? "application/json" },
        });
      const heartbeat = setInterval(() => {
        void idempotencyDependencies.idempotency.renew(claim, result.leaseId).catch(() => {});
      }, 30000);
      try {
        await idempotencyDependencies.withTransaction(async () => {
          await next();
          if (c.res.status >= 500) throw new IdempotencyRollback();
          if (c.res.status === 204) {
            await idempotencyDependencies.idempotency.complete(claim, result.leaseId, 204, {}, "");
            return;
          }
          const responseBody = await c.res
            .clone()
            .json()
            .catch(() => null);
          if (responseBody === null) throw new Error("Idempotency response must be JSON");
          await idempotencyDependencies.idempotency.complete(
            claim,
            result.leaseId,
            c.res.status,
            responseBody,
            c.res.headers.get("content-type") ?? "application/json",
          );
        });
      } catch (caught) {
        await idempotencyDependencies.idempotency.release(claim, result.leaseId);
        if (caught instanceof IdempotencyRollback) return;
        throw caught;
      } finally {
        clearInterval(heartbeat);
      }
    });

  if (authHandler) {
    app.all("/v1/auth/*", async (c) => {
      if (!authOperationSet.has(`${c.req.method.toUpperCase()} ${c.req.path}`)) return c.notFound();
      const response = await authHandler(c.req.raw);
      if (
        response.ok ||
        (c.req.path === "/v1/auth/verify-email" && response.status >= 300 && response.status < 400)
      )
        return response;

      let original: { code?: unknown } | null = null;
      try {
        original = (await response.clone().json()) as { code?: unknown };
      } catch {
        // Some Better Auth errors, such as rate limiting, are not JSON.
      }
      const code =
        typeof original?.code === "string" && /^[A-Z][A-Z0-9_]*$/.test(original.code)
          ? original.code
          : "AUTH_ERROR";
      const title =
        response.status === 401
          ? "No se pudo autenticar."
          : response.status === 403
            ? "Solicitud no permitida."
            : response.status === 429
              ? "Demasiados intentos. Inténtalo más tarde."
              : "No se pudo completar la solicitud.";
      // El registro no revela por qué falla (evita descubrir correos registrados),
      // salvo que falte aceptar los términos, que no dice nada de la cuenta.
      const safeCode =
        c.req.path === "/v1/auth/sign-up/email" && code !== "CONSENT_REQUIRED"
          ? "REGISTRATION_FAILED"
          : code;
      const problem: Problem & { message: string } = {
        type: `https://notesia.local/problems/${safeCode.toLowerCase().replaceAll("_", "-")}`,
        title,
        message: title,
        status: response.status,
        code: safeCode,
        requestId: crypto.randomUUID(),
      };
      const headers = new Headers(response.headers);
      headers.set("Content-Type", "application/problem+json");
      headers.delete("Content-Length");
      return new Response(JSON.stringify(problem), { status: response.status, headers });
    });
  }

  if (meDependencies) registerMeRoutes(app, meDependencies);
  if (activityDependencies) registerActivityRoutes(app, activityDependencies);
  if (subtaskDependencies) registerSubtaskRoutes(app, subtaskDependencies);
  if (calendarEventDependencies) registerCalendarEventRoutes(app, calendarEventDependencies);
  if (availabilityDependencies) registerAvailabilityRoutes(app, availabilityDependencies);
  if (planDependencies) registerPlanRoutes(app, planDependencies);
  if (timeEntryDependencies) registerTimeEntryRoutes(app, timeEntryDependencies);
  if (notificationDependencies) registerNotificationRoutes(app, notificationDependencies);
  if (privacyDependencies) registerPrivacyRoutes(app, privacyDependencies);
  if (adminDependencies) registerAdminRoutes(app, adminDependencies);
  if (adminDependencies?.reports)
    registerReportRoutes(app, {
      getSession: adminDependencies.getSession,
      reports: adminDependencies.reports,
    });
  if (aiDependencies) registerAiRoutes(app, aiDependencies);
  if (accountExportDependencies) registerAccountExportRoutes(app, accountExportDependencies);
  if (pushDependencies) registerPushDeviceRoutes(app, pushDependencies);
  if (accountDeletionDependencies) registerAccountDeletionRoutes(app, accountDeletionDependencies);
  if (activitySeriesDependencies) registerActivitySeriesRoutes(app, activitySeriesDependencies);

  app.get("/v1/health", (c) => c.json(healthSchema.parse({ status: "ok" })));

  app.get("/v1/ready", async (c) => {
    try {
      await checkDatabase();
      return c.json(readinessSchema.parse({ status: "ok", database: "ready" }));
    } catch {
      const problem: Problem = {
        type: "https://notesia.local/problems/service-unavailable",
        title: "Servicio no disponible",
        status: 503,
        code: "SERVICE_UNAVAILABLE",
        requestId: crypto.randomUUID(),
      };
      return c.json(problem, 503, { "Content-Type": "application/problem+json" });
    }
  });

  return app;
}
