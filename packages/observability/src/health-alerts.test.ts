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
    ai: { windowMinutes: 15, knownCostUsd: "0.000000000", uncostedRequests: 0, providers: [] },
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

test("health alerts distinguish unavailable providers, sustained errors and configured cost", () => {
  const health: OperationalHealth = {
    queues: { outbox: empty(), push: empty(), recoveryMail: empty() },
    worker: { lastSeenAt: "2026-09-24T12:00:00.000Z", seenRecently: true },
    ai: {
      windowMinutes: 15,
      knownCostUsd: "2.500000000",
      uncostedRequests: 3,
      providers: [
        { provider: "openai", requests: 5, successes: 0, unavailable: 5, errors: 5 },
        { provider: "anthropic", requests: 10, successes: 4, unavailable: 2, errors: 6 },
        { provider: "deepseek", requests: 10, successes: 10, unavailable: 0, errors: 0 },
      ],
    },
  };
  expect(
    evaluateHealthAlerts(health, new Date("2026-09-24T12:00:00.000Z"), {
      aiCostLimitUsd15m: "2.000000000",
    }),
  ).toEqual([
    { code: "AI_PROVIDER_UNAVAILABLE", provider: "openai" },
    { code: "AI_ERROR_RATE_HIGH", provider: "anthropic" },
    { code: "AI_COST_HIGH" },
  ]);
  expect(evaluateHealthAlerts(health, new Date("2026-09-24T12:00:00.000Z"))).not.toContainEqual({
    code: "AI_COST_HIGH",
  });
});
