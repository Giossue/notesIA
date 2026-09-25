import { readDeletionPolicy, readRecoveryConfig } from "@notesia/config";
import {
  createAccountDeletionRepository,
  createAiRepository,
  createIdempotencyRepository,
  createNotificationSchedulerRepository,
  createOutboxRepository,
  createPushDeliveryRepository,
  createPushTokenCipher,
  createRecoveryMailRepository,
  createTracedPool,
  createWorkerHealthRepository,
  purgeExpiredSecureStorage,
} from "@notesia/db";
import {
  configureTraceObserver,
  writeTraceObservation,
  writeWorkerObservation,
} from "@notesia/observability";
import { Pool } from "pg";
import { createFcmSender } from "./fcm";
import { createRecoverySmtpSender } from "./recovery-smtp";
import { createRiskReassessment } from "./risk-reassessment";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
configureTraceObserver(writeTraceObservation);
const pool = createTracedPool(new Pool({ connectionString: databaseUrl, max: 2 }));
const outbox = createOutboxRepository(pool);
const scheduler = createNotificationSchedulerRepository(pool);
const riskReassessment = createRiskReassessment(pool);
const pushCipher = process.env.PUSH_ENCRYPTION_KEY
  ? createPushTokenCipher(process.env.PUSH_ENCRYPTION_KEY)
  : null;
const fcmSender = process.env.FCM_PROJECT_ID
  ? createFcmSender({ projectId: process.env.FCM_PROJECT_ID })
  : null;
if (fcmSender && !pushCipher)
  throw new Error("PUSH_ENCRYPTION_KEY is required when FCM_PROJECT_ID is set");
const push = pushCipher && fcmSender ? createPushDeliveryRepository(pool, pushCipher) : null;
const recoveryConfig = readRecoveryConfig(process.env);
const recoverySender = recoveryConfig ? createRecoverySmtpSender(recoveryConfig.smtp) : null;
if (recoverySender && !process.env.BETTER_AUTH_SECRET)
  throw new Error("BETTER_AUTH_SECRET is required for recovery mail");
const recovery = recoverySender
  ? createRecoveryMailRepository(pool, process.env.BETTER_AUTH_SECRET as string)
  : null;
const deletionPolicy = readDeletionPolicy(process.env);
if (deletionPolicy && !process.env.BETTER_AUTH_SECRET)
  throw new Error("BETTER_AUTH_SECRET is required for account deletion");
const deletion = deletionPolicy
  ? createAccountDeletionRepository(pool, deletionPolicy, process.env.BETTER_AUTH_SECRET)
  : null;
let nextAuditCleanup = 0;
const idempotency = createIdempotencyRepository(pool);
const ai = createAiRepository(pool);
const workerHealth = createWorkerHealthRepository(pool);
let nextStorageCleanup = 0;
let nextAiReconciliation = 0;
let running = true;
const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

process.on("SIGTERM", () => {
  running = false;
});
process.on("SIGINT", () => {
  running = false;
});

while (running) {
  const started = performance.now();
  try {
    await workerHealth.beat();
    const recoveryResult =
      recovery && recoverySender
        ? await recovery.processOne(recoverySender)
        : { kind: "empty" as const };
    const result = await outbox.processOne();
    const riskResult = await riskReassessment.processOne();
    const scheduled = await scheduler.processDue();
    const pushResult =
      push && fcmSender ? await push.processOne(fcmSender) : { kind: "empty" as const };
    const deletionResult = deletion ? await deletion.processDue() : "empty";
    let aiReconciled = 0;
    if (Date.now() >= nextAiReconciliation) {
      aiReconciled = await ai.reconcileAbandoned();
      nextAiReconciliation = aiReconciled === 500 ? 0 : Date.now() + 60_000;
    }
    if (deletion && Date.now() >= nextAuditCleanup) {
      await deletion.purgeExpiredAudit();
      nextAuditCleanup = Date.now() + 60 * 60 * 1000;
    }
    if (Date.now() >= nextStorageCleanup) {
      const expiredSessions = await purgeExpiredSecureStorage(pool);
      const expiredKeys = await idempotency.purgeExpired();
      if (expiredSessions < 500 && expiredKeys < 500)
        nextStorageCleanup = Date.now() + 60 * 60 * 1000;
    }
    const idle =
      result.kind === "empty" &&
      riskResult.kind === "empty" &&
      recoveryResult.kind === "empty" &&
      scheduled === 0 &&
      pushResult.kind === "empty" &&
      deletionResult === "empty" &&
      aiReconciled === 0;
    if (idle) {
      await pause(3000);
    } else {
      writeWorkerObservation({
        outcome: "processed",
        durationMs: Math.max(0, Math.round(performance.now() - started)),
        recovery: Number(recoveryResult.kind !== "empty"),
        outbox: Number(result.kind !== "empty"),
        risk: Number(riskResult.kind !== "empty"),
        scheduled,
        push: Number(pushResult.kind !== "empty"),
        deletion: Number(deletionResult !== "empty"),
        aiReconciled,
      });
    }
  } catch {
    // Payloads and database errors may contain private data. Retry without logging them.
    writeWorkerObservation({
      outcome: "error",
      durationMs: Math.max(0, Math.round(performance.now() - started)),
    });
    await pause(5000);
  }
}
await pool.end();
