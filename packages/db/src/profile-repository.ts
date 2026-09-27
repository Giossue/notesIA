import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { userProfiles } from "./schema";

type ProfileChanges = {
  displayName: string;
  language: "es" | "en";
  timeZone: string;
  avatar?: string;
  version: number;
};

export function createProfileRepository(pool: Pool) {
  const db = drizzle({ client: pool });

  return {
    async get(userId: string) {
      const rows = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1);
      return rows[0] ?? null;
    },
    async update(userId: string, changes: ProfileChanges) {
      const rows = await db
        .update(userProfiles)
        .set({
          displayName: changes.displayName,
          language: changes.language,
          timeZone: changes.timeZone,
          ...(changes.avatar ? { avatar: changes.avatar } : {}),
          version: sql`${userProfiles.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(userProfiles.userId, userId), eq(userProfiles.version, changes.version)))
        .returning();
      return rows[0] ?? null;
    },
    /** Marca terminada la configuración inicial; repetirlo no cambia la fecha. */
    async completeOnboarding(userId: string) {
      await pool.query(
        `UPDATE dominio.perfiles_usuario SET configuracion_inicial_en = now()
         WHERE usuario_id = $1 AND configuracion_inicial_en IS NULL`,
        [userId],
      );
      return this.get(userId);
    },
  };
}

export type ProfileRepository = ReturnType<typeof createProfileRepository>;
