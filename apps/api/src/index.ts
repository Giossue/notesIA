import {
  readApiRuntimeConfig,
  readDeletionPolicy,
  readOperationalAlertConfig,
} from "@notesia/config";
import {
  createAccountDeletionRepository,
  createAccountExportRepository,
  createActivityRepository,
  createActivitySeriesRepository,
  createAdminRateLimiter,
  createAdminRepository,
  createAiContextRepository,
  createAiRepository,
  createAvailabilityRepository,
  createCalendarEventRepository,
  createIdempotencyRepository,
  createNotificationPreferenceRepository,
  createNotificationRepository,
  createPlanRepository,
  createPreferenceRepository,
  createPrivacyRepository,
  createProfileRepository,
  createPushDeviceRepository,
  createPushTokenCipher,
  createRequestTransactionPool,
  createSubtaskRepository,
  createTimeEntryRepository,
  createTracedPool,
} from "@notesia/db";
import {
  configureTraceObserver,
  writeHttpObservation,
  writeTraceObservation,
} from "@notesia/observability";
import { Pool } from "pg";
import { createApiShutdown } from "./api-lifecycle";
import { createApp } from "./app";
import {
  adminOrigin,
  auth,
  handler as authHandler,
  pool as authPool,
  getSession,
} from "./auth/auth";
import { createAiGateway } from "./modules/ai/gateway";
import { createAiKeyCipher } from "./modules/ai/key-cipher";
import { createOperationalMonitor } from "./operational-monitor";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}
const runtime = readApiRuntimeConfig(process.env);

configureTraceObserver(writeTraceObservation);
const domainPool = createTracedPool(new Pool({ connectionString: databaseUrl, max: 10 }));
const requestTransactions = createRequestTransactionPool(domainPool);
const repositoryPool = requestTransactions.pool;
const aiRepository = createAiRepository(repositoryPool);
const aiKeyCipher = process.env.AI_ENCRYPTION_KEY
  ? createAiKeyCipher(process.env.AI_ENCRYPTION_KEY)
  : null;
const pushCipher = process.env.PUSH_ENCRYPTION_KEY
  ? createPushTokenCipher(process.env.PUSH_ENCRYPTION_KEY)
  : null;
const deletionPolicy = readDeletionPolicy(process.env);
const operationalAlertConfig = readOperationalAlertConfig(process.env);
const adminRepository = createAdminRepository(
  repositoryPool,
  process.env.BETTER_AUTH_SECRET as string,
);
const app = createApp(
  async () => {
    await domainPool.query("SELECT 1");
  },
  authHandler,
  {
    getSession,
    profiles: createProfileRepository(repositoryPool),
    preferences: createPreferenceRepository(repositoryPool),
  },
  {
    getSession,
    activities: createActivityRepository(repositoryPool),
    profiles: createProfileRepository(repositoryPool),
  },
  {
    getSession,
    activities: createActivityRepository(repositoryPool),
    subtasks: createSubtaskRepository(repositoryPool),
  },
  {
    getSession,
    events: createCalendarEventRepository(repositoryPool),
    profiles: createProfileRepository(repositoryPool),
  },
  {
    getSession,
    availability: createAvailabilityRepository(repositoryPool),
    events: createCalendarEventRepository(repositoryPool),
    profiles: createProfileRepository(repositoryPool),
  },
  {
    getSession,
    plans: createPlanRepository(repositoryPool),
    preferences: createPreferenceRepository(repositoryPool),
    timeEntries: createTimeEntryRepository(repositoryPool),
    activities: createActivityRepository(repositoryPool),
    availability: createAvailabilityRepository(repositoryPool),
    events: createCalendarEventRepository(repositoryPool),
    profiles: createProfileRepository(repositoryPool),
  },
  {
    getSession,
    timeEntries: createTimeEntryRepository(repositoryPool),
    activities: createActivityRepository(repositoryPool),
    profiles: createProfileRepository(repositoryPool),
  },
  {
    getSession,
    idempotency: createIdempotencyRepository(repositoryPool),
    withTransaction: requestTransactions.withTransaction,
  },
  {
    getSession,
    notifications: createNotificationRepository(repositoryPool),
    preferences: createNotificationPreferenceRepository(repositoryPool),
  },
  {
    getSession,
    privacy: createPrivacyRepository(repositoryPool),
  },
  {
    getSession,
    admin: adminRepository,
    rateLimiter: createAdminRateLimiter(repositoryPool, process.env.BETTER_AUTH_SECRET as string),
    verifyPassword: async (headers, password) => {
      try {
        return (await auth.api.verifyPassword({ headers, body: { password } })).status;
      } catch {
        return false;
      }
    },
    ai: aiRepository,
    aiKeyCipher,
    allowedOrigin: adminOrigin,
    alertPolicy: { aiCostLimitUsd15m: operationalAlertConfig?.aiCostLimitUsd15m ?? null },
  },
  {
    getSession,
    gateway: createAiGateway(aiRepository, aiKeyCipher),
    context: createAiContextRepository(repositoryPool),
  },
  {
    getSession,
    verifyPassword: async (headers, password) => {
      try {
        return (await auth.api.verifyPassword({ headers, body: { password } })).status;
      } catch {
        return false;
      }
    },
    exports: createAccountExportRepository(repositoryPool),
  },
  {
    getSession,
    devices: createPushDeviceRepository(repositoryPool),
    cipher: pushCipher,
  },
  {
    getSession,
    verifyPassword: async (headers, password) => {
      try {
        return (await auth.api.verifyPassword({ headers, body: { password } })).status;
      } catch {
        return false;
      }
    },
    deletions: deletionPolicy
      ? createAccountDeletionRepository(
          repositoryPool,
          deletionPolicy,
          process.env.BETTER_AUTH_SECRET,
        )
      : null,
  },
  {
    getSession,
    series: createActivitySeriesRepository(repositoryPool),
    profiles: createProfileRepository(repositoryPool),
  },
  writeHttpObservation,
  writeTraceObservation,
);

const server = Bun.serve({
  hostname: runtime.hostname,
  port: runtime.port,
  fetch: app.fetch,
});

const operationalMonitor = operationalAlertConfig
  ? createOperationalMonitor({
      config: operationalAlertConfig,
      readHealth: () => adminRepository.systemHealth(),
    })
  : null;
operationalMonitor?.start();

const shutdown = createApiShutdown({
  server,
  monitor: operationalMonitor,
  pools: [domainPool, authPool],
  graceMs: runtime.shutdownGraceMs,
});
const handleShutdown = () => {
  void shutdown().catch(() => {
    process.exitCode = 1;
    console.error("API graceful shutdown failed");
  });
};
process.once("SIGTERM", handleShutdown);
process.once("SIGINT", handleShutdown);
