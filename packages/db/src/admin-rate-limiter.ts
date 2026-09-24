import type { Pool } from "pg";
import { createSecureStorage } from "./auth-secure-storage";

const WINDOW_MS = 60_000;
const READ_LIMIT = 120;
const MUTATION_LIMIT = 30;

export function createAdminRateLimiter(pool: Pool, authSecret: string, now = () => new Date()) {
  const storage = createSecureStorage(pool, authSecret);
  return {
    async check(userId: string, method: string, at = now()) {
      const time = at.getTime();
      const bucket = Math.floor(time / WINDOW_MS);
      const category = method === "GET" ? "read" : "mutation";
      const limit = category === "read" ? READ_LIMIT : MUTATION_LIMIT;
      const count = await storage.increment(`admin-rate:v1:${userId}:${category}:${bucket}`, 120);
      return {
        allowed: count <= limit,
        retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (time % WINDOW_MS)) / 1000)),
      };
    },
  };
}

export type AdminRateLimiter = ReturnType<typeof createAdminRateLimiter>;
