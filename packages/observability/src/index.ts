export {
  evaluateHealthAlerts,
  type HealthAlert,
  type OperationalHealth,
  type QueueHealth,
} from "./health-alerts";

const areas = new Set([
  "auth",
  "me",
  "subjects",
  "academic-periods",
  "activities",
  "activity-series",
  "calendar-events",
  "availability-rules",
  "availability-exceptions",
  "availability",
  "plans",
  "risk-assessments",
  "time-entries",
  "notifications",
  "ai",
  "admin",
  "privacy",
  "health",
  "ready",
]);
const methods = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

export type HttpObservation = {
  requestId: string;
  method: string;
  area: string;
  status: number;
  durationMs: number;
};

export function httpArea(pathname: string) {
  const segment = pathname.split("/")[2] ?? "";
  return areas.has(segment) ? segment : "unknown";
}

export function writeHttpObservation(
  event: HttpObservation,
  write: (line: string) => void = console.info,
) {
  write(
    JSON.stringify({
      type: "http",
      at: new Date().toISOString(),
      requestId: event.requestId,
      method: methods.has(event.method) ? event.method : "OTHER",
      area: areas.has(event.area) ? event.area : "unknown",
      status: event.status,
      durationMs: event.durationMs,
    }),
  );
}

export type WorkerObservation =
  | { outcome: "error"; durationMs: number }
  | {
      outcome: "processed";
      durationMs: number;
      recovery: number;
      outbox: number;
      risk: number;
      scheduled: number;
      push: number;
      deletion: number;
      aiReconciled: number;
    };

export function writeWorkerObservation(
  event: WorkerObservation,
  write: (line: string) => void = console.info,
) {
  write(
    JSON.stringify({
      type: "worker_cycle",
      at: new Date().toISOString(),
      outcome: event.outcome,
      durationMs: event.durationMs,
      ...(event.outcome === "processed"
        ? {
            recovery: event.recovery,
            outbox: event.outbox,
            risk: event.risk,
            scheduled: event.scheduled,
            push: event.push,
            deletion: event.deletion,
            aiReconciled: event.aiReconciled,
          }
        : {}),
    }),
  );
}
