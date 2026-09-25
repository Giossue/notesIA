import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/;
const SPAN_ID_PATTERN = /^[0-9a-f]{16}$/;
const ZERO_TRACE_ID = "0".repeat(32);
const ZERO_SPAN_ID = "0".repeat(16);

const spanNames = new Set([
  "api.request",
  "db.outbox.enqueue",
  "db.push.enqueue",
  "db.query",
  "db.recovery-mail.enqueue",
  "worker.outbox",
  "worker.push-delivery",
  "worker.recovery-mail",
  "provider.ai",
  "provider.fcm",
  "provider.smtp",
]);
const components = new Set(["api", "database", "worker", "provider"]);
const targets = new Set(["postgresql", "openai", "anthropic", "deepseek", "fcm", "smtp"]);

export type TracePropagation = Readonly<{ traceId: string; spanId: string }>;
export type TraceContext = TracePropagation & Readonly<{ parentSpanId: string | null }>;
export type TraceSpanName =
  | "api.request"
  | "db.outbox.enqueue"
  | "db.push.enqueue"
  | "db.query"
  | "db.recovery-mail.enqueue"
  | "worker.outbox"
  | "worker.push-delivery"
  | "worker.recovery-mail"
  | "provider.ai"
  | "provider.fcm"
  | "provider.smtp";
export type TraceComponent = "api" | "database" | "worker" | "provider";
export type TraceTarget = "postgresql" | "openai" | "anthropic" | "deepseek" | "fcm" | "smtp";

export type TraceObservation = TraceContext & {
  name: TraceSpanName;
  component: TraceComponent;
  target?: TraceTarget;
  outcome: "ok" | "error";
  durationMs: number;
};

const storage = new AsyncLocalStorage<TraceContext>();
let defaultTraceObserver: ((event: TraceObservation) => void) | null = null;

export function configureTraceObserver(observer: ((event: TraceObservation) => void) | null) {
  defaultTraceObserver = observer;
}

function randomHex(bytes: number) {
  let value = randomBytes(bytes).toString("hex");
  while (/^0+$/.test(value)) value = randomBytes(bytes).toString("hex");
  return value;
}

function validSpanId(value: unknown): value is string {
  return typeof value === "string" && SPAN_ID_PATTERN.test(value) && value !== ZERO_SPAN_ID;
}

export function tracePropagation(traceId: unknown, spanId: unknown): TracePropagation | null {
  if (
    typeof traceId !== "string" ||
    typeof spanId !== "string" ||
    !TRACE_ID_PATTERN.test(traceId) ||
    !validSpanId(spanId) ||
    traceId === ZERO_TRACE_ID
  )
    return null;
  return { traceId, spanId };
}

export function parseTraceparent(value: string | null | undefined): TracePropagation | null {
  if (!value) return null;
  const match = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/.exec(value);
  if (!match) return null;
  return tracePropagation(match[1], match[2]);
}

export function createTraceContext(parent: TracePropagation | null = null): TraceContext {
  return {
    traceId: parent?.traceId ?? randomHex(16),
    spanId: randomHex(8),
    parentSpanId: parent?.spanId ?? null,
  };
}

export function formatTraceparent(context: TracePropagation) {
  return `00-${context.traceId}-${context.spanId}-01`;
}

export function runWithTraceContext<T>(context: TraceContext, action: () => T): T {
  return storage.run(context, action);
}

export function currentTraceContext() {
  return storage.getStore() ?? null;
}

export function currentTracePropagation(): TracePropagation | null {
  const context = currentTraceContext();
  return context ? { traceId: context.traceId, spanId: context.spanId } : null;
}

export function writeTraceObservation(
  event: TraceObservation,
  write: (line: string) => void = console.info,
) {
  if (
    !tracePropagation(event.traceId, event.spanId) ||
    (event.parentSpanId !== null && !validSpanId(event.parentSpanId))
  )
    return;
  write(
    JSON.stringify({
      type: "trace_span",
      at: new Date().toISOString(),
      traceId: event.traceId,
      spanId: event.spanId,
      parentSpanId: event.parentSpanId,
      name: spanNames.has(event.name) ? event.name : "unknown",
      component: components.has(event.component) ? event.component : "unknown",
      ...(event.target && targets.has(event.target) ? { target: event.target } : {}),
      outcome: event.outcome === "ok" ? "ok" : "error",
      durationMs: Number.isFinite(event.durationMs) ? Math.max(0, Math.round(event.durationMs)) : 0,
    }),
  );
}

type SpanOptions = {
  name: TraceSpanName;
  component: TraceComponent;
  target?: TraceTarget;
  parent?: TracePropagation | null;
  observe?: (event: TraceObservation) => void;
};

export async function withTraceSpan<T>(options: SpanOptions, action: () => Promise<T>): Promise<T> {
  const parent = options.parent === undefined ? currentTracePropagation() : options.parent;
  const context = createTraceContext(parent);
  const started = performance.now();
  let outcome: TraceObservation["outcome"] = "error";
  try {
    const result = await runWithTraceContext(context, action);
    outcome = "ok";
    return result;
  } finally {
    const observe = options.observe ?? defaultTraceObserver;
    if (observe) {
      try {
        observe({
          ...context,
          name: options.name,
          component: options.component,
          ...(options.target ? { target: options.target } : {}),
          outcome,
          durationMs: performance.now() - started,
        });
      } catch {
        console.warn("Trace observation failed");
      }
    }
  }
}
