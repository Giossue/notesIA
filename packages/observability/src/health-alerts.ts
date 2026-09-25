export type QueueHealth = {
  pending: number;
  ready: number;
  inFlight: number;
  dead: number;
  oldestReadyAt: string | null;
};

export type AiProviderHealth = {
  provider: "openai" | "anthropic" | "deepseek";
  requests: number;
  successes: number;
  unavailable: number;
  errors: number;
};

export type AiOperationalHealth = {
  windowMinutes: 15;
  knownCostUsd: string;
  uncostedRequests: number;
  providers: AiProviderHealth[];
};

export type OperationalHealth = {
  queues: {
    outbox: QueueHealth;
    push: QueueHealth;
    recoveryMail: QueueHealth;
    verificationMail: QueueHealth;
  };
  worker: { lastSeenAt: string | null; seenRecently: boolean };
  ai: AiOperationalHealth;
};

export type HealthAlert =
  | {
      code: "WORKER_UNAVAILABLE" | "QUEUE_BACKLOG" | "QUEUE_DEAD";
      queue: "outbox" | "push" | "recoveryMail" | "verificationMail" | null;
    }
  | {
      code: "AI_PROVIDER_UNAVAILABLE" | "AI_ERROR_RATE_HIGH";
      provider: AiProviderHealth["provider"];
    }
  | { code: "AI_COST_HIGH" };

export type HealthAlertPolicy = { aiCostLimitUsd15m?: string | null };

const MAX_READY = 100;
const MAX_READY_AGE_MS = 5 * 60_000;
const PROVIDER_UNAVAILABLE_MINIMUM = 5;
const ERROR_RATE_MINIMUM = 10;
const ERROR_RATE_PERCENT = 50;

function usdNanos(value: string) {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,9}))?$/.exec(value);
  if (!match) return null;
  return BigInt(match[1] as string) * 1_000_000_000n + BigInt((match[2] ?? "").padEnd(9, "0"));
}

export function evaluateHealthAlerts(
  health: OperationalHealth,
  now = new Date(),
  policy: HealthAlertPolicy = {},
): HealthAlert[] {
  const alerts: HealthAlert[] = [];
  if (!health.worker.seenRecently) alerts.push({ code: "WORKER_UNAVAILABLE", queue: null });
  for (const queue of ["outbox", "push", "recoveryMail", "verificationMail"] as const) {
    const state = health.queues[queue];
    if (state.dead > 0) alerts.push({ code: "QUEUE_DEAD", queue });
    const oldestReady = state.oldestReadyAt ? Date.parse(state.oldestReadyAt) : NaN;
    if (
      state.ready >= MAX_READY ||
      (state.ready > 0 &&
        Number.isFinite(oldestReady) &&
        now.getTime() - oldestReady > MAX_READY_AGE_MS)
    )
      alerts.push({ code: "QUEUE_BACKLOG", queue });
  }
  for (const provider of health.ai.providers) {
    if (provider.successes === 0 && provider.unavailable >= PROVIDER_UNAVAILABLE_MINIMUM) {
      alerts.push({ code: "AI_PROVIDER_UNAVAILABLE", provider: provider.provider });
      continue;
    }
    if (
      provider.requests >= ERROR_RATE_MINIMUM &&
      provider.errors * 100 >= provider.requests * ERROR_RATE_PERCENT
    )
      alerts.push({ code: "AI_ERROR_RATE_HIGH", provider: provider.provider });
  }
  const cost = usdNanos(health.ai.knownCostUsd);
  const costLimit = policy.aiCostLimitUsd15m ? usdNanos(policy.aiCostLimitUsd15m) : null;
  if (cost !== null && costLimit !== null && cost >= costLimit)
    alerts.push({ code: "AI_COST_HIGH" });
  return alerts;
}
