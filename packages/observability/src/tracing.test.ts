import { expect, test } from "bun:test";
import {
  createTraceContext,
  currentTraceContext,
  formatTraceparent,
  parseTraceparent,
  runWithTraceContext,
  tracePropagation,
  withTraceSpan,
  writeTraceObservation,
} from "./tracing";

const incoming = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";

test("parses version 00 traceparent and rejects malformed or zero identifiers", () => {
  expect(parseTraceparent(incoming)).toEqual({
    traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
    spanId: "00f067aa0ba902b7",
  });
  expect(parseTraceparent(incoming.toUpperCase())).toBeNull();
  expect(parseTraceparent("00-00000000000000000000000000000000-00f067aa0ba902b7-01")).toBeNull();
  expect(parseTraceparent("00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01")).toBeNull();
  expect(parseTraceparent("01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")).toBeNull();
  expect(tracePropagation("private", "private")).toBeNull();
});

test("creates a child context and emits a normalized W3C traceparent", () => {
  const parent = parseTraceparent(incoming);
  if (!parent) throw new Error("Expected valid traceparent fixture");
  const context = createTraceContext(parent);
  expect(context.traceId).toBe(parent.traceId);
  expect(context.parentSpanId).toBe(parent.spanId);
  expect(context.spanId).toMatch(/^[0-9a-f]{16}$/);
  expect(context.spanId).not.toBe(parent.spanId);
  expect(formatTraceparent(context)).toBe(`00-${context.traceId}-${context.spanId}-01`);
});

test("keeps concurrent asynchronous contexts isolated", async () => {
  const first = createTraceContext();
  const second = createTraceContext();
  const [seenFirst, seenSecond] = await Promise.all([
    runWithTraceContext(first, async () => {
      await Bun.sleep(5);
      return currentTraceContext();
    }),
    runWithTraceContext(second, async () => {
      await Bun.sleep(1);
      return currentTraceContext();
    }),
  ]);
  expect(seenFirst).toEqual(first);
  expect(seenSecond).toEqual(second);
  expect(currentTraceContext()).toBeNull();
});

test("records child spans without exception details or arbitrary fields", async () => {
  const lines: string[] = [];
  const parent = createTraceContext();
  await expect(
    runWithTraceContext(parent, () =>
      withTraceSpan(
        {
          name: "provider.ai",
          component: "provider",
          target: "openai",
          observe: (event) =>
            writeTraceObservation(
              { ...event, privatePayload: "secret" } as Parameters<typeof writeTraceObservation>[0],
              (line) => lines.push(line),
            ),
        },
        async () => {
          throw new Error("private provider response");
        },
      ),
    ),
  ).rejects.toThrow("private provider response");
  const event = JSON.parse(lines[0] ?? "null");
  expect(event).toMatchObject({
    type: "trace_span",
    traceId: parent.traceId,
    parentSpanId: parent.spanId,
    name: "provider.ai",
    component: "provider",
    target: "openai",
    outcome: "error",
  });
  expect(lines[0]).not.toContain("private");
  expect(lines[0]).not.toContain("secret");

  writeTraceObservation(
    {
      ...parent,
      traceId: "private trace identifier",
      name: "api.request",
      component: "api",
      outcome: "ok",
      durationMs: 1,
    },
    (line) => lines.push(line),
  );
  expect(lines).toHaveLength(1);
});
