import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { userPreferences } from "./schema";

type Changes = {
  minSessionMinutes: number;
  maxSessionMinutes: number;
  maxDailyMinutes: number;
  notificationsEnabled: boolean;
  pushNotificationsEnabled?: boolean;
  quietStartMinute: number;
  quietEndMinute: number;
  version: number;
};

export function createPreferenceRepository(pool: Pool) {
  const db = drizzle({ client: pool });
  return {
    async get(userId: string) {
      const [row] = await db
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, userId))
        .limit(1);
      return row ?? null;
    },
    async update(userId: string, changes: Changes) {
      const [row] = await db
        .update(userPreferences)
        .set({
          minSessionMinutes: changes.minSessionMinutes,
          maxSessionMinutes: changes.maxSessionMinutes,
          maxDailyMinutes: changes.maxDailyMinutes,
          notificationsEnabled: changes.notificationsEnabled,
          ...(changes.pushNotificationsEnabled === undefined
            ? {}
            : { pushNotificationsEnabled: changes.pushNotificationsEnabled }),
          quietStartMinute: changes.quietStartMinute,
          quietEndMinute: changes.quietEndMinute,
          version: sql`${userPreferences.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(eq(userPreferences.userId, userId), eq(userPreferences.version, changes.version)),
        )
        .returning();
      return row ?? null;
    },
  };
}
export type PreferenceRepository = ReturnType<typeof createPreferenceRepository>;
