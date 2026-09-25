import { expect, test } from "bun:test";
import { createApiShutdown } from "./api-lifecycle";

test("API shutdown is idempotent and closes resources after the listener", async () => {
  const events: string[] = [];
  const shutdown = createApiShutdown({
    server: {
      async stop(force) {
        events.push(force ? "server:forced" : "server:graceful");
      },
    },
    monitor: { stop: () => events.push("monitor") },
    pools: [
      { end: async () => void events.push("domain-pool") },
      { end: async () => void events.push("auth-pool") },
    ],
    graceMs: 100,
  });

  const first = shutdown();
  const second = shutdown();
  expect(first).toBe(second);
  await first;
  expect(events).toEqual(["monitor", "server:graceful", "domain-pool", "auth-pool"]);
});

test("API shutdown forces lingering connections after the grace period", async () => {
  const calls: boolean[] = [];
  const shutdown = createApiShutdown({
    server: {
      stop(force = false) {
        calls.push(force);
        return force ? Promise.resolve() : new Promise<void>(() => {});
      },
    },
    pools: [],
    graceMs: 1,
  });

  await shutdown();
  expect(calls).toEqual([false, true]);
});

test("API shutdown attempts every pool close before reporting a failure", async () => {
  let secondPoolClosed = false;
  const shutdown = createApiShutdown({
    server: { stop: async () => {} },
    pools: [
      {
        end: async () => {
          throw new Error("private database detail");
        },
      },
      {
        end: async () => {
          secondPoolClosed = true;
        },
      },
    ],
    graceMs: 100,
  });

  await expect(shutdown()).rejects.toThrow("API shutdown failed");
  expect(secondPoolClosed).toBe(true);
});
