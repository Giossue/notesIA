import { and, desc, eq, gte, isNotNull, isNull, lt, notInArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { activities, activityHistory } from "./schema";

type ActivityFields = {
  kind: "academic_task" | "exam" | "personal" | "routine";
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high" | "critical";
  startAfterAt: Date | null;
  deadlineAt: Date | null;
  estimatedMinutes: number | null;
};

type ListOptions = {
  archived: boolean;
  cursor: bigint | null;
  seriesId?: string;
  status?: "backlog" | "planned" | "in_progress" | "completed" | "cancelled";
  dayBounds?: { startsAt: Date; endsAt: Date };
};

function sameInstant(left: Date | null, right: Date | null) {
  return left?.getTime() === right?.getTime();
}

function matchesFields(row: typeof activities.$inferSelect, fields: ActivityFields) {
  return (
    row.kind === fields.kind &&
    row.title === fields.title &&
    row.description === fields.description &&
    row.priority === fields.priority &&
    sameInstant(row.startAfterAt, fields.startAfterAt) &&
    sameInstant(row.deadlineAt, fields.deadlineAt) &&
    row.estimatedMinutes === fields.estimatedMinutes
  );
}

export function createActivityRepository(pool: Pool) {
  const db = drizzle({ client: pool });

  return {
    async get(userId: string, id: string) {
      const rows = await db
        .select()
        .from(activities)
        .where(
          and(eq(activities.userId, userId), eq(activities.id, id), isNull(activities.deletedAt)),
        )
        .limit(1);
      return rows[0] ?? null;
    },

    async list(userId: string, options: ListOptions) {
      return db
        .select()
        .from(activities)
        .where(
          and(
            eq(activities.userId, userId),
            isNull(activities.deletedAt),
            options.archived ? isNotNull(activities.archivedAt) : isNull(activities.archivedAt),
            options.status ? eq(activities.status, options.status) : undefined,
            options.seriesId ? eq(activities.seriesId, options.seriesId) : undefined,
            options.cursor ? lt(activities.sortOrder, options.cursor) : undefined,
            options.dayBounds ? gte(activities.deadlineAt, options.dayBounds.startsAt) : undefined,
            options.dayBounds ? lt(activities.deadlineAt, options.dayBounds.endsAt) : undefined,
          ),
        )
        .orderBy(desc(activities.sortOrder))
        .limit(21);
    },

    async summary(userId: string, day: { startsAt: Date; endsAt: Date }, now: Date) {
      const open = sql`${activities.status} not in ('completed', 'cancelled')`;
      const rows = await db
        .select({
          dueToday: sql<number>`count(*) filter (where ${open} and ${activities.deadlineAt} >= ${day.startsAt} and ${activities.deadlineAt} < ${day.endsAt})::int`,
          pending: sql<number>`count(*) filter (where ${activities.status} in ('backlog', 'planned'))::int`,
          inProgress: sql<number>`count(*) filter (where ${activities.status} = 'in_progress')::int`,
          overdue: sql<number>`count(*) filter (where ${open} and ${activities.deadlineAt} < ${now})::int`,
        })
        .from(activities)
        .where(
          and(
            eq(activities.userId, userId),
            isNull(activities.deletedAt),
            isNull(activities.archivedAt),
          ),
        );
      return rows[0] ?? { dueToday: 0, pending: 0, inProgress: 0, overdue: 0 };
    },

    /** Instantes de finalización y plazo dentro de un rango, para agrupar por día local. */
    async completionsAndDeadlines(userId: string, range: { startsAt: Date; endsAt: Date }) {
      const inRange = (column: typeof activities.completedAt | typeof activities.deadlineAt) =>
        and(gte(column, range.startsAt), lt(column, range.endsAt));
      return db
        .select({
          status: activities.status,
          completedAt: activities.completedAt,
          deadlineAt: activities.deadlineAt,
        })
        .from(activities)
        .where(
          and(
            eq(activities.userId, userId),
            isNull(activities.deletedAt),
            sql`(${inRange(activities.completedAt)} or ${inRange(activities.deadlineAt)})`,
          ),
        );
    },

    /** Totales por tipo de actividad (sin canceladas ni archivadas). */
    async kindProgress(userId: string) {
      return db
        .select({
          kind: activities.kind,
          total: sql<number>`count(*) filter (where ${activities.status} <> 'cancelled')::int`,
          completed: sql<number>`count(*) filter (where ${activities.status} = 'completed')::int`,
        })
        .from(activities)
        .where(
          and(
            eq(activities.userId, userId),
            isNull(activities.deletedAt),
            isNull(activities.archivedAt),
          ),
        )
        .groupBy(activities.kind);
    },

    /** Días (AAAA-MM-DD locales) en que el estudiante completó alguna actividad. */
    async streakDays(userId: string) {
      const rows = await db.execute<{ day: string }>(
        sql`SELECT fecha::text AS day FROM dominio.dias_racha WHERE usuario_id = ${userId}`,
      );
      return rows.rows.map((row) => row.day);
    },

    async listForPlanning(userId: string) {
      return db
        .select()
        .from(activities)
        .where(
          and(
            eq(activities.userId, userId),
            isNull(activities.deletedAt),
            isNull(activities.archivedAt),
            isNotNull(activities.estimatedMinutes),
            notInArray(activities.status, ["completed", "cancelled"]),
          ),
        )
        .orderBy(activities.createdAt, activities.id)
        .limit(501);
    },

    async create(userId: string, id: string, fields: ActivityFields) {
      const inserted = await db
        .insert(activities)
        .values({ id, userId, ...fields })
        .onConflictDoNothing()
        .returning();
      if (inserted[0]) return { row: inserted[0], created: true };
      const existing = await this.get(userId, id);
      if (existing && existing.archivedAt === null && matchesFields(existing, fields))
        return { row: existing, created: false };
      return null;
    },

    async update(userId: string, id: string, fields: ActivityFields & { version: number }) {
      const rows = await db
        .update(activities)
        .set({
          ...fields,
          version: sql`${activities.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(activities.userId, userId),
            eq(activities.id, id),
            eq(activities.version, fields.version),
            isNull(activities.archivedAt),
            isNull(activities.deletedAt),
          ),
        )
        .returning();
      if (rows[0]) return rows[0];
      const existing = await this.get(userId, id);
      return existing &&
        existing.archivedAt === null &&
        existing.version === fields.version + 1 &&
        matchesFields(existing, fields)
        ? existing
        : null;
    },

    async setArchived(userId: string, id: string, version: number, archived: boolean) {
      const rows = await db
        .update(activities)
        .set({
          archivedAt: archived ? new Date() : null,
          version: sql`${activities.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(activities.userId, userId),
            eq(activities.id, id),
            eq(activities.version, version),
            isNull(activities.deletedAt),
            archived ? isNull(activities.archivedAt) : isNotNull(activities.archivedAt),
          ),
        )
        .returning();
      return rows[0] ?? null;
    },

    async softDelete(userId: string, id: string, input: { version: number; mutationId: string }) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(activities)
          .where(and(eq(activities.userId, userId), eq(activities.id, id)))
          .limit(1)
          .for("update");
        if (!current) return { kind: "not_found" as const };
        const [replay] = await tx
          .select({ activityId: activityHistory.activityId, eventType: activityHistory.eventType })
          .from(activityHistory)
          .where(
            and(
              eq(activityHistory.userId, userId),
              eq(activityHistory.mutationId, input.mutationId),
            ),
          )
          .limit(1);
        if (replay) {
          return replay.activityId === id &&
            replay.eventType === "deleted" &&
            current.deletedAt !== null &&
            current.version === input.version + 1
            ? { kind: "replayed" as const }
            : { kind: "conflict" as const };
        }
        if (current.deletedAt) return { kind: "not_found" as const };
        if (current.version !== input.version) return { kind: "conflict" as const };
        await tx
          .update(activities)
          .set({
            deletedAt: new Date(),
            version: sql`${activities.version} + 1`,
            updatedAt: new Date(),
          })
          .where(and(eq(activities.userId, userId), eq(activities.id, id)));
        await tx.insert(activityHistory).values({
          userId,
          activityId: id,
          mutationId: input.mutationId,
          eventType: "deleted",
          beforeStatus: current.status,
          afterStatus: current.status,
          beforeProgress: current.progressPercent,
          afterProgress: current.progressPercent,
        });
        return { kind: "deleted" as const };
      });
    },

    async transition(
      userId: string,
      id: string,
      input: {
        version: number;
        mutationId: string;
        eventType: "completed" | "reopened" | "cancelled" | "started" | "paused";
      },
    ) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(activities)
          .where(
            and(eq(activities.userId, userId), eq(activities.id, id), isNull(activities.deletedAt)),
          )
          .limit(1)
          .for("update");
        if (!current) return { kind: "not_found" as const };

        const [replay] = await tx
          .select({
            activityId: activityHistory.activityId,
            eventType: activityHistory.eventType,
            afterStatus: activityHistory.afterStatus,
            afterProgress: activityHistory.afterProgress,
          })
          .from(activityHistory)
          .where(
            and(
              eq(activityHistory.userId, userId),
              eq(activityHistory.mutationId, input.mutationId),
            ),
          )
          .limit(1);
        if (replay) {
          if (
            replay.activityId === id &&
            replay.eventType === input.eventType &&
            current.version === input.version + 1 &&
            current.status === replay.afterStatus &&
            current.progressPercent === replay.afterProgress
          ) {
            return { kind: "replayed" as const, row: current };
          }
          return { kind: "conflict" as const };
        }

        if (current.version !== input.version || current.archivedAt)
          return { kind: "conflict" as const };
        const isFinal = current.status === "completed" || current.status === "cancelled";
        if (input.eventType === "reopened" ? !isFinal : isFinal) {
          return { kind: "conflict" as const };
        }
        // Iniciar y pausar solo cambian entre pendiente y en progreso; el avance se conserva.
        if (input.eventType === "started" && current.status === "in_progress")
          return { kind: "conflict" as const };
        if (input.eventType === "paused" && current.status !== "in_progress")
          return { kind: "conflict" as const };

        const status =
          input.eventType === "completed"
            ? "completed"
            : input.eventType === "cancelled"
              ? "cancelled"
              : input.eventType === "started"
                ? "in_progress"
                : input.eventType === "paused"
                  ? "backlog"
                  : current.status === "cancelled" && current.progressPercent > 0
                    ? "in_progress"
                    : "backlog";
        const progressPercent =
          input.eventType === "completed"
            ? 100
            : input.eventType === "reopened" && current.status === "completed"
              ? 0
              : current.progressPercent;
        const [updated] = await tx
          .update(activities)
          .set({
            status,
            progressPercent,
            completedAt: input.eventType === "completed" ? new Date() : null,
            version: sql`${activities.version} + 1`,
            updatedAt: new Date(),
          })
          .where(and(eq(activities.userId, userId), eq(activities.id, id)))
          .returning();

        await tx.insert(activityHistory).values({
          userId,
          activityId: id,
          mutationId: input.mutationId,
          eventType: input.eventType,
          beforeStatus: current.status,
          afterStatus: status,
          beforeProgress: current.progressPercent,
          afterProgress: progressPercent,
        });
        return { kind: "updated" as const, row: updated };
      });
    },

    async setProgress(
      userId: string,
      id: string,
      input: { version: number; mutationId: string; progressPercent: number },
    ) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(activities)
          .where(
            and(eq(activities.userId, userId), eq(activities.id, id), isNull(activities.deletedAt)),
          )
          .limit(1)
          .for("update");
        if (!current) return { kind: "not_found" as const };
        const [replay] = await tx
          .select({
            activityId: activityHistory.activityId,
            eventType: activityHistory.eventType,
            afterProgress: activityHistory.afterProgress,
          })
          .from(activityHistory)
          .where(
            and(
              eq(activityHistory.userId, userId),
              eq(activityHistory.mutationId, input.mutationId),
            ),
          )
          .limit(1);
        if (replay) {
          if (
            replay.activityId === id &&
            replay.eventType === "progress_updated" &&
            replay.afterProgress === input.progressPercent &&
            current.version === input.version + 1 &&
            current.progressPercent === input.progressPercent
          )
            return { kind: "replayed" as const, row: current };
          return { kind: "conflict" as const };
        }
        if (
          current.version !== input.version ||
          current.archivedAt ||
          current.status === "cancelled"
        )
          return { kind: "conflict" as const };
        if (current.progressPercent === input.progressPercent)
          return { kind: "unchanged" as const, row: current };
        const status =
          input.progressPercent === 100
            ? "completed"
            : input.progressPercent === 0
              ? "backlog"
              : "in_progress";
        const [updated] = await tx
          .update(activities)
          .set({
            status,
            progressPercent: input.progressPercent,
            completedAt: status === "completed" ? new Date() : null,
            version: sql`${activities.version} + 1`,
            updatedAt: new Date(),
          })
          .where(and(eq(activities.userId, userId), eq(activities.id, id)))
          .returning();
        await tx.insert(activityHistory).values({
          userId,
          activityId: id,
          mutationId: input.mutationId,
          eventType: "progress_updated",
          beforeStatus: current.status,
          afterStatus: status,
          beforeProgress: current.progressPercent,
          afterProgress: input.progressPercent,
        });
        return { kind: "updated" as const, row: updated };
      });
    },

    async history(userId: string, id: string, cursor: bigint | null) {
      return db
        .select()
        .from(activityHistory)
        .where(
          and(
            eq(activityHistory.userId, userId),
            eq(activityHistory.activityId, id),
            cursor ? lt(activityHistory.id, cursor) : undefined,
          ),
        )
        .orderBy(desc(activityHistory.id))
        .limit(21);
    },
  };
}

export type ActivityRepository = ReturnType<typeof createActivityRepository>;
