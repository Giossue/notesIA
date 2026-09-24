import { and, asc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { activities, subtasks } from "./schema";

type SubtaskFields = { title: string; estimatedMinutes: number | null };
type UpdateFields = SubtaskFields & {
  isCompleted: boolean;
  version: number;
  mutationId: string;
};

export function createSubtaskRepository(pool: Pool) {
  const db = drizzle({ client: pool });

  return {
    async get(userId: string, activityId: string, id: string) {
      const [row] = await db
        .select()
        .from(subtasks)
        .where(
          and(
            eq(subtasks.userId, userId),
            eq(subtasks.activityId, activityId),
            eq(subtasks.id, id),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async list(userId: string, activityId: string, archived: boolean, cursor: bigint | null) {
      return db
        .select()
        .from(subtasks)
        .where(
          and(
            eq(subtasks.userId, userId),
            eq(subtasks.activityId, activityId),
            archived ? isNotNull(subtasks.archivedAt) : isNull(subtasks.archivedAt),
            cursor ? gt(subtasks.sortOrder, cursor) : undefined,
          ),
        )
        .orderBy(asc(subtasks.sortOrder))
        .limit(21);
    },

    async create(userId: string, activityId: string, id: string, fields: SubtaskFields) {
      return db.transaction(async (tx) => {
        const [parent] = await tx
          .select({ archivedAt: activities.archivedAt })
          .from(activities)
          .where(
            and(
              eq(activities.userId, userId),
              eq(activities.id, activityId),
              isNull(activities.deletedAt),
            ),
          )
          .limit(1)
          .for("update");
        if (!parent) return { kind: "not_found" as const };
        if (parent.archivedAt) return { kind: "conflict" as const };

        const [inserted] = await tx
          .insert(subtasks)
          .values({ id, userId, activityId, ...fields })
          .onConflictDoNothing()
          .returning();
        if (inserted) return { kind: "created" as const, row: inserted };

        const [existing] = await tx
          .select()
          .from(subtasks)
          .where(
            and(
              eq(subtasks.userId, userId),
              eq(subtasks.activityId, activityId),
              eq(subtasks.id, id),
            ),
          )
          .limit(1);
        if (
          existing &&
          !existing.archivedAt &&
          existing.title === fields.title &&
          existing.estimatedMinutes === fields.estimatedMinutes
        ) {
          return { kind: "replayed" as const, row: existing };
        }
        return { kind: "conflict" as const };
      });
    },

    async update(userId: string, activityId: string, id: string, fields: UpdateFields) {
      return db.transaction(async (tx) => {
        const [parent] = await tx
          .select({ archivedAt: activities.archivedAt })
          .from(activities)
          .where(
            and(
              eq(activities.userId, userId),
              eq(activities.id, activityId),
              isNull(activities.deletedAt),
            ),
          )
          .limit(1)
          .for("update");
        if (!parent) return { kind: "not_found" as const };
        if (parent.archivedAt) return { kind: "conflict" as const };

        const [current] = await tx
          .select()
          .from(subtasks)
          .where(
            and(
              eq(subtasks.userId, userId),
              eq(subtasks.activityId, activityId),
              eq(subtasks.id, id),
            ),
          )
          .limit(1)
          .for("update");
        if (!current) return { kind: "not_found" as const };
        if (
          current.lastMutationId === fields.mutationId &&
          current.version === fields.version + 1 &&
          current.title === fields.title &&
          current.estimatedMinutes === fields.estimatedMinutes &&
          current.isCompleted === fields.isCompleted
        ) {
          return { kind: "replayed" as const, row: current };
        }
        if (current.version !== fields.version || current.archivedAt)
          return { kind: "conflict" as const };

        const [updated] = await tx
          .update(subtasks)
          .set({
            title: fields.title,
            estimatedMinutes: fields.estimatedMinutes,
            isCompleted: fields.isCompleted,
            completedAt:
              current.isCompleted === fields.isCompleted
                ? current.completedAt
                : fields.isCompleted
                  ? new Date()
                  : null,
            lastMutationId: fields.mutationId,
            version: sql`${subtasks.version} + 1`,
            updatedAt: new Date(),
          })
          .where(and(eq(subtasks.userId, userId), eq(subtasks.id, id)))
          .returning();
        return { kind: "updated" as const, row: updated };
      });
    },

    async setArchived(
      userId: string,
      activityId: string,
      id: string,
      input: { archived: boolean; version: number; mutationId: string },
    ) {
      return db.transaction(async (tx) => {
        const [parent] = await tx
          .select({ archivedAt: activities.archivedAt })
          .from(activities)
          .where(
            and(
              eq(activities.userId, userId),
              eq(activities.id, activityId),
              isNull(activities.deletedAt),
            ),
          )
          .limit(1)
          .for("update");
        if (!parent) return { kind: "not_found" as const };
        if (parent.archivedAt) return { kind: "conflict" as const };

        const [current] = await tx
          .select()
          .from(subtasks)
          .where(
            and(
              eq(subtasks.userId, userId),
              eq(subtasks.activityId, activityId),
              eq(subtasks.id, id),
            ),
          )
          .limit(1)
          .for("update");
        if (!current) return { kind: "not_found" as const };
        if (
          current.lastMutationId === input.mutationId &&
          current.version === input.version + 1 &&
          Boolean(current.archivedAt) === input.archived
        ) {
          return { kind: "replayed" as const, row: current };
        }
        if (current.version !== input.version || Boolean(current.archivedAt) === input.archived)
          return { kind: "conflict" as const };

        const [updated] = await tx
          .update(subtasks)
          .set({
            archivedAt: input.archived ? new Date() : null,
            lastMutationId: input.mutationId,
            version: sql`${subtasks.version} + 1`,
            updatedAt: new Date(),
          })
          .where(and(eq(subtasks.userId, userId), eq(subtasks.id, id)))
          .returning();
        return { kind: "updated" as const, row: updated };
      });
    },
  };
}

export type SubtaskRepository = ReturnType<typeof createSubtaskRepository>;
