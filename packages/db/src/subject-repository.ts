import { and, desc, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { subjects } from "./schema";

type SubjectFields = {
  periodId?: string | null;
  name: string;
  code: string | null;
  colorToken: "primary" | "secondary" | "tertiary";
};

type Cursor = bigint;

export function createSubjectRepository(pool: Pool) {
  const db = drizzle({ client: pool });

  return {
    async get(userId: string, id: string) {
      const rows = await db
        .select()
        .from(subjects)
        .where(and(eq(subjects.userId, userId), eq(subjects.id, id), isNull(subjects.deletedAt)))
        .limit(1);
      return rows[0] ?? null;
    },
    async list(userId: string, archived: boolean, cursor: Cursor | null) {
      const before = cursor ? lt(subjects.sortOrder, cursor) : undefined;
      return db
        .select()
        .from(subjects)
        .where(
          and(
            eq(subjects.userId, userId),
            isNull(subjects.deletedAt),
            archived ? isNotNull(subjects.archivedAt) : isNull(subjects.archivedAt),
            before,
          ),
        )
        .orderBy(desc(subjects.sortOrder))
        .limit(21);
    },
    async create(userId: string, id: string, fields: SubjectFields) {
      const inserted = await db
        .insert(subjects)
        .values({ id, userId, ...fields, periodId: fields.periodId ?? null })
        .onConflictDoNothing()
        .returning();
      if (inserted[0]) return { row: inserted[0], created: true };
      const existing = await this.get(userId, id);
      if (
        existing &&
        existing.archivedAt === null &&
        existing.periodId === (fields.periodId ?? null) &&
        existing.name === fields.name &&
        existing.code === fields.code &&
        existing.colorToken === fields.colorToken
      ) {
        return { row: existing, created: false };
      }
      return null;
    },
    async update(userId: string, id: string, fields: SubjectFields & { version: number }) {
      const rows = await db
        .update(subjects)
        .set({
          name: fields.name,
          ...(fields.periodId !== undefined ? { periodId: fields.periodId } : {}),
          code: fields.code,
          colorToken: fields.colorToken,
          version: sql`${subjects.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(subjects.userId, userId),
            eq(subjects.id, id),
            eq(subjects.version, fields.version),
            isNull(subjects.archivedAt),
            isNull(subjects.deletedAt),
          ),
        )
        .returning();
      return rows[0] ?? null;
    },
    async setArchived(userId: string, id: string, version: number, archived: boolean) {
      const rows = await db
        .update(subjects)
        .set({
          archivedAt: archived ? new Date() : null,
          version: sql`${subjects.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(subjects.userId, userId),
            eq(subjects.id, id),
            eq(subjects.version, version),
            isNull(subjects.deletedAt),
            archived ? isNull(subjects.archivedAt) : isNotNull(subjects.archivedAt),
          ),
        )
        .returning();
      return rows[0] ?? null;
    },
  };
}

export type SubjectRepository = ReturnType<typeof createSubjectRepository>;
