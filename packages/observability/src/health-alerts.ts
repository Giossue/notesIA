export type QueueHealth = {
  pending: number;
  ready: number;
  inFlight: number;
  dead: number;
  oldestReadyAt: string | null;
};

export type OperationalHealth = {
  queues: {
    outbox: QueueHealth;
    push: QueueHealth;
    recoveryMail: QueueHealth;
  };
  worker: { lastSeenAt: string | null; seenRecently: boolean };
};

export type HealthAlert = {
  code: "WORKER_UNAVAILABLE" | "QUEUE_BACKLOG" | "QUEUE_DEAD";
  queue: "outbox" | "push" | "recoveryMail" | null;
};

const MAX_READY = 100;
const MAX_READY_AGE_MS = 5 * 60_000;

export function evaluateHealthAlerts(health: OperationalHealth, now = new Date()): HealthAlert[] {
  const alerts: HealthAlert[] = [];
  if (!health.worker.seenRecently) alerts.push({ code: "WORKER_UNAVAILABLE", queue: null });
  for (const queue of ["outbox", "push", "recoveryMail"] as const) {
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
  return alerts;
}
