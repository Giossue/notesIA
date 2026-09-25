import { expect, test } from "bun:test";
import {
  httpArea,
  writeHttpObservation,
  writeOperationalMonitorObservation,
  writeWorkerObservation,
} from "./index";

test("HTTP observations keep a fixed set of fields and classify paths without private data", () => {
  const lines: string[] = [];
  writeHttpObservation(
    {
      requestId: "request-1",
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      method: "POST",
      area: httpArea("/v1/activities/private-id"),
      status: 409,
      durationMs: 12,
      path: "/v1/activities/private-id?token=private-value",
    } as Parameters<typeof writeHttpObservation>[0],
    (line) => lines.push(line),
  );
  const event = JSON.parse(lines[0] ?? "null");
  expect(event).toMatchObject({
    type: "http",
    requestId: "request-1",
    traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
    method: "POST",
    area: "activities",
    status: 409,
    durationMs: 12,
  });
  expect(JSON.stringify(event)).not.toContain("private-id");
  expect(JSON.stringify(event)).not.toContain("private-value");
  expect(httpArea("/v1/private@example.test")).toBe("unknown");
  const unknown: string[] = [];
  writeHttpObservation(
    {
      requestId: "request-2",
      traceId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      method: "private-method",
      area: "private-area",
      status: 400,
      durationMs: 1,
    },
    (line) => unknown.push(line),
  );
  expect(JSON.parse(unknown[0] ?? "null")).toMatchObject({ method: "OTHER", area: "unknown" });
});

test("worker failure observations omit exception details", () => {
  const lines: string[] = [];
  writeWorkerObservation(
    { outcome: "error", durationMs: 100, error: "private SQL and payload" } as Parameters<
      typeof writeWorkerObservation
    >[0],
    (line) => lines.push(line),
  );
  expect(JSON.parse(lines[0] ?? "null")).toMatchObject({
    type: "worker_cycle",
    outcome: "error",
    durationMs: 100,
  });
  expect(lines[0]).not.toContain("private SQL and payload");
});

test("worker processed observations report verification mail as a bounded counter", () => {
  const lines: string[] = [];
  writeWorkerObservation(
    {
      outcome: "processed",
      durationMs: 20,
      verification: 1,
      recovery: 0,
      outbox: 0,
      risk: 0,
      scheduled: 0,
      push: 0,
      deletion: 0,
      aiReconciled: 0,
    },
    (line) => lines.push(line),
  );
  expect(JSON.parse(lines[0] ?? "null")).toMatchObject({
    type: "worker_cycle",
    outcome: "processed",
    verification: 1,
  });
});

test("operational alert observations expose only bounded delivery metadata", () => {
  const lines: string[] = [];
  writeOperationalMonitorObservation(
    {
      outcome: "error",
      activeAlerts: 2,
      durationMs: 50,
      error: "private webhook URL and response",
    } as Parameters<typeof writeOperationalMonitorObservation>[0],
    (line) => lines.push(line),
  );
  expect(JSON.parse(lines[0] ?? "null")).toMatchObject({
    type: "operational_alert_check",
    outcome: "error",
    activeAlerts: 2,
    durationMs: 50,
  });
  expect(lines[0]).not.toContain("private");
  expect(lines[0]).not.toContain("webhook");
});
