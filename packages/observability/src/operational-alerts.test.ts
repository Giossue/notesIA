import { expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import type { HealthAlert } from "./health-alerts";
import { createOperationalAlertReporter } from "./operational-alerts";

const secret = Buffer.alloc(32, 7);
const active: HealthAlert[] = [
  { code: "QUEUE_DEAD", queue: "recoveryMail" },
  { code: "WORKER_UNAVAILABLE", queue: null },
];

test("operational alert reporter signs state changes, limits repeats and reports resolution", async () => {
  let timestamp = Date.parse("2026-09-24T12:00:00.000Z");
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const reporter = createOperationalAlertReporter({
    webhookUrl: "https://alerts.example.test/notesia",
    secret,
    source: "notesia-test",
    repeatIntervalMs: 60000,
    now: () => new Date(timestamp),
    fetcher: async (url, init) => {
      requests.push({ url, init });
      return new Response(null, { status: 204 });
    },
  });

  expect(await reporter.report([])).toBe("unchanged");
  expect(requests).toHaveLength(0);
  expect(await reporter.report(active)).toBe("sent");
  expect(requests).toHaveLength(1);
  const first = requests[0];
  const firstBody = String(first?.init.body);
  const firstHeaders = new Headers(first?.init.headers);
  const firstPayload = JSON.parse(firstBody);
  expect(first?.url).toBe("https://alerts.example.test/notesia");
  expect(firstPayload).toEqual({
    schemaVersion: 1,
    eventId: expect.stringMatching(/^[a-f0-9]{64}$/),
    source: "notesia-test",
    observedAt: "2026-09-24T12:00:00.000Z",
    status: "firing",
    alerts: [
      { code: "QUEUE_DEAD", queue: "recoveryMail" },
      { code: "WORKER_UNAVAILABLE", queue: null },
    ],
  });
  expect(firstHeaders.get("idempotency-key")).toBe(firstPayload.eventId);
  expect(firstHeaders.get("x-notesia-signature")).toBe(
    `sha256=${createHmac("sha256", secret).update(firstBody).digest("hex")}`,
  );

  timestamp += 30000;
  expect(await reporter.report([...active].reverse())).toBe("unchanged");
  timestamp += 30000;
  expect(await reporter.report(active)).toBe("sent");
  expect(requests).toHaveLength(2);
  expect(new Headers(requests[1]?.init.headers).get("idempotency-key")).not.toBe(
    firstPayload.eventId,
  );

  timestamp += 1000;
  expect(await reporter.report([])).toBe("sent");
  const resolved = JSON.parse(String(requests[2]?.init.body));
  expect(resolved).toMatchObject({ status: "resolved", alerts: [] });
  expect(JSON.stringify(resolved)).not.toContain("private");
});

test("operational alert reporter retries the exact event after a failed delivery", async () => {
  const requests: RequestInit[] = [];
  let succeeds = false;
  const reporter = createOperationalAlertReporter({
    webhookUrl: "https://alerts.example.test/notesia",
    secret,
    source: "notesia-test",
    repeatIntervalMs: 60000,
    now: () => new Date("2026-09-24T12:00:00.000Z"),
    fetcher: async (_url, init) => {
      requests.push(init);
      return new Response(null, { status: succeeds ? 204 : 503 });
    },
  });

  await expect(reporter.report(active)).rejects.toThrow("Operational alert delivery failed");
  succeeds = true;
  expect(await reporter.report(active)).toBe("sent");
  expect(requests).toHaveLength(2);
  expect(requests[1]?.body).toBe(requests[0]?.body);
  expect(new Headers(requests[1]?.headers).get("idempotency-key")).toBe(
    new Headers(requests[0]?.headers).get("idempotency-key"),
  );
  expect(new Headers(requests[1]?.headers).get("x-notesia-signature")).toBe(
    new Headers(requests[0]?.headers).get("x-notesia-signature"),
  );
});
