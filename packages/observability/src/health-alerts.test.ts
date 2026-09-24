import { expect, test } from "bun:test";
import { evaluateHealthAlerts, type OperationalHealth } from "./health-alerts";

const empty = () => ({
  pending: 0,
  ready: 0,
  inFlight: 0,
  dead: 0,
  oldestReadyAt: null,
});

test("health alerts flag stalled and dead queues without payloads or identities", () => {
  const health: OperationalHealth = {
    queues: {
      outbox: { ...empty(), pending: 1, ready: 1, oldestReadyAt: "2026-09-24T11:54:00.000Z" },
      push: { ...empty(), pending: 100, ready: 100, oldestReadyAt: "2026-09-24T11:59:00.000Z" },
      recoveryMail: { ...empty(), dead: 1 },
    },
    worker: { lastSeenAt: null, seenRecently: false },
  };
  expect(evaluateHealthAlerts(health, new Date("2026-09-24T12:00:00.000Z"))).toEqual([
    { code: "WORKER_UNAVAILABLE", queue: null },
    { code: "QUEUE_BACKLOG", queue: "outbox" },
    { code: "QUEUE_BACKLOG", queue: "push" },
    { code: "QUEUE_DEAD", queue: "recoveryMail" },
  ]);
  health.worker.seenRecently = true;
  health.queues.outbox = { ...empty(), pending: 1 };
  health.queues.push = empty();
  health.queues.recoveryMail = empty();
  expect(evaluateHealthAlerts(health, new Date("2026-09-24T12:00:00.000Z"))).toEqual([]);
});
