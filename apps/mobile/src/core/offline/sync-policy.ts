export type SyncDisposition = "success" | "conflict" | "failed" | "retry" | "auth";

export function classifySyncResponse(status: number): SyncDisposition {
  if (status >= 200 && status < 300) return "success";
  if (status === 401) return "auth";
  if (status === 409) return "conflict";
  if (status === 408 || status === 429 || status >= 500) return "retry";
  return "failed";
}

export function retryDelayMs(attempt: number, random = Math.random()) {
  const base = Math.min(5 * 60_000, 1000 * 2 ** Math.min(attempt, 9));
  return Math.round(base * (0.75 + random * 0.5));
}
