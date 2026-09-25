import { createHash, createHmac } from "node:crypto";
import type { HealthAlert } from "./health-alerts";

export type OperationalAlertPayload = {
  schemaVersion: 1;
  eventId: string;
  source: string;
  observedAt: string;
  status: "firing" | "resolved";
  alerts: HealthAlert[];
};

export type OperationalAlertFetch = (url: string, init: RequestInit) => Promise<Response>;

type Options = {
  webhookUrl: string;
  secret: Buffer;
  source: string;
  repeatIntervalMs: number;
  fetcher?: OperationalAlertFetch;
  now?: () => Date;
};

function normalizedAlerts(alerts: readonly HealthAlert[]) {
  const unique = new Map<string, HealthAlert>();
  const target = (alert: HealthAlert) =>
    "queue" in alert ? (alert.queue ?? "") : "provider" in alert ? alert.provider : "";
  for (const alert of alerts) unique.set(`${alert.code}:${target(alert)}`, { ...alert });
  return [...unique.values()].sort((left, right) => {
    const byCode = left.code.localeCompare(right.code);
    return byCode || target(left).localeCompare(target(right));
  });
}

export function createOperationalAlertReporter(options: Options) {
  if (options.secret.length !== 32) throw new Error("Operational alert secret must be 32 bytes");
  if (!Number.isSafeInteger(options.repeatIntervalMs) || options.repeatIntervalMs <= 0)
    throw new Error("Operational alert repeat interval must be positive");
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? (() => new Date());
  let lastFingerprint: string | null = null;
  let lastDeliveredAt = 0;
  let pending:
    | {
        fingerprint: string;
        previousFingerprint: string;
        body: string;
        eventId: string;
      }
    | undefined;

  return {
    async report(alerts: readonly HealthAlert[]) {
      const observedAt = now();
      const normalized = normalizedAlerts(alerts);
      const fingerprint = JSON.stringify(normalized);
      if (lastFingerprint === null && normalized.length === 0) {
        lastFingerprint = fingerprint;
        lastDeliveredAt = observedAt.getTime();
        return "unchanged" as const;
      }
      const changed = fingerprint !== lastFingerprint;
      const repeatDue =
        normalized.length > 0 &&
        fingerprint === lastFingerprint &&
        Math.max(0, observedAt.getTime() - lastDeliveredAt) >= options.repeatIntervalMs;
      if (!changed && !repeatDue) return "unchanged" as const;

      const previousFingerprint = lastFingerprint ?? "initial";
      if (
        !pending ||
        pending.fingerprint !== fingerprint ||
        pending.previousFingerprint !== previousFingerprint
      ) {
        const window = Math.floor(observedAt.getTime() / options.repeatIntervalMs);
        const eventId = createHash("sha256")
          .update(
            `notesia-operational-alert-v1\n${options.source}\n${previousFingerprint}\n${fingerprint}\n${window}`,
          )
          .digest("hex");
        const payload: OperationalAlertPayload = {
          schemaVersion: 1,
          eventId,
          source: options.source,
          observedAt: observedAt.toISOString(),
          status: normalized.length > 0 ? "firing" : "resolved",
          alerts: normalized,
        };
        pending = {
          fingerprint,
          previousFingerprint,
          body: JSON.stringify(payload),
          eventId,
        };
      }

      const delivery = pending;
      const signature = createHmac("sha256", options.secret).update(delivery.body).digest("hex");
      const response = await fetcher(options.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": delivery.eventId,
          "X-NotesIA-Signature": `sha256=${signature}`,
        },
        body: delivery.body,
        signal: AbortSignal.timeout(5000),
      });
      const delivered = response.ok;
      await response.body?.cancel().catch(() => {});
      if (!delivered) throw new Error("Operational alert delivery failed");
      lastFingerprint = fingerprint;
      lastDeliveredAt = now().getTime();
      pending = undefined;
      return "sent" as const;
    },
  };
}

export type OperationalAlertReporter = ReturnType<typeof createOperationalAlertReporter>;
