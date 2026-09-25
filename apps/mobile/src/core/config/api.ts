import { normalizeApiBaseUrl } from "./api-url";

type RuntimeConfig = typeof globalThis & { __NOTESIA_API_BASE_URL__?: unknown };

export function getApiBaseUrl() {
  const development = typeof __DEV__ !== "undefined" && __DEV__;
  return normalizeApiBaseUrl((globalThis as RuntimeConfig).__NOTESIA_API_BASE_URL__, development);
}
