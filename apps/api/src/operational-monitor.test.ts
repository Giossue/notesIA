import { expect, test } from "bun:test";
import type { OperationalHealth, OperationalMonitorObservation } from "@notesia/observability";
import { createOperationalMonitor } from "./operational-monitor";

const config = {
  webhookUrl: "https://alerts.example.test/notesia",
  secret: Buffer.alloc(32),
  source: "notesia-test",
  checkIntervalMs: 30000,
  repeatIntervalMs: 60000,
  aiCostLimitUsd15m: null,
};

const emptyQueue = () => ({
  pending: 0,
  ready: 0,
  inFlight: 0,
  dead: 0,
  oldestReadyAt: null,
});

test("operational monitor evaluates health and reports only the resulting signals", async () => {
  const health: OperationalHealth = {
    queues: {
      outbox: emptyQueue(),
      push: emptyQueue(),
      recoveryMail: emptyQueue(),
    },
    worker: { lastSeenAt: null, seenRecently: false },
    ai: { windowMinutes: 15, knownCostUsd: "0.000000000", uncostedRequests: 0, providers: [] },
  };
  const reported: unknown[] = [];
  const observations: OperationalMonitorObservation[] = [];
  const monitor = createOperationalMonitor({
    config,
    readHealth: async () => health,
    reporter: {
      report: async (alerts) => {
        reported.push(alerts);
        return "sent";
      },
    },
    observe: (event) => observations.push(event),
  });

  await monitor.check();
  expect(reported).toEqual([[{ code: "WORKER_UNAVAILABLE", queue: null }]]);
  expect(observations).toHaveLength(1);
  expect(observations[0]).toMatchObject({ outcome: "sent", activeAlerts: 1 });
  monitor.stop();
});

test("operational monitor keeps failures private and available for the next check", async () => {
  const observations: OperationalMonitorObservation[] = [];
  const monitor = createOperationalMonitor({
    config,
    readHealth: async () => {
      throw new Error("private database connection details");
    },
    reporter: { report: async () => "unchanged" },
    observe: (event) => observations.push(event),
  });

  await expect(monitor.check()).resolves.toBeUndefined();
  expect(observations).toHaveLength(1);
  expect(observations[0]).toMatchObject({ outcome: "error", activeAlerts: 0 });
  expect(JSON.stringify(observations)).not.toContain("private");
  monitor.stop();
});
