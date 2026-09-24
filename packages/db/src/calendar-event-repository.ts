import { and, asc, desc, eq, gt, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { calendarEvents } from "./schema";

type EventFields = {
  subjectId: string | null;
  kind: "class" | "work" | "appointment" | "personal" | "unavailable" | "other";
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
};

function matchesFields(row: typeof calendarEvents.$inferSelect, fields: EventFields) {
  return (
    row.subjectId === fields.subjectId &&
    row.kind === fields.kind &&
    row.title === fields.title &&
    row.description === fields.description &&
    row.startsAt.getTime() === fields.startsAt.getTime() &&
    row.endsAt.getTime() === fields.endsAt.getTime() &&
    row.timeZone === fields.timeZone
  );
}

export function createCalendarEventRepository(pool: Pool) {
  const db = drizzle({ client: pool });

  return {
    async get(userId: string, id: string) {
      const [row] = await db
        .select()
        .from(calendarEvents)
        .where(and(eq(calendarEvents.userId, userId), eq(calendarEvents.id, id)))
        .limit(1);
      return row ?? null;
    },

    async list(userId: string, archived: boolean, cursor: bigint | null) {
      return db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.userId, userId),
            archived ? isNotNull(calendarEvents.archivedAt) : isNull(calendarEvents.archivedAt),
            cursor ? lt(calendarEvents.sortOrder, cursor) : undefined,
          ),
        )
        .orderBy(desc(calendarEvents.sortOrder))
        .limit(21);
    },

    async listOnDay(
      userId: string,
      bounds: { startsAt: Date; endsAt: Date },
      cursor: { startsAt: Date; id: string } | null,
    ) {
      return db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.userId, userId),
            isNull(calendarEvents.archivedAt),
            lt(calendarEvents.startsAt, bounds.endsAt),
            gt(calendarEvents.endsAt, bounds.startsAt),
            cursor
              ? or(
                  gt(calendarEvents.startsAt, cursor.startsAt),
                  and(
                    eq(calendarEvents.startsAt, cursor.startsAt),
                    gt(calendarEvents.id, cursor.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(asc(calendarEvents.startsAt), asc(calendarEvents.id))
        .limit(21);
    },

    async listInRange(userId: string, bounds: { startsAt: Date; endsAt: Date }) {
      return db
        .select({ startsAt: calendarEvents.startsAt, endsAt: calendarEvents.endsAt })
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.userId, userId),
            isNull(calendarEvents.archivedAt),
            lt(calendarEvents.startsAt, bounds.endsAt),
            gt(calendarEvents.endsAt, bounds.startsAt),
          ),
        );
    },

    async create(userId: string, id: string, fields: EventFields) {
      const [inserted] = await db
        .insert(calendarEvents)
        .values({ id, userId, ...fields })
        .onConflictDoNothing()
        .returning();
      if (inserted) return { kind: "created" as const, row: inserted };
      const existing = await this.get(userId, id);
      if (existing && !existing.archivedAt && matchesFields(existing, fields))
        return { kind: "replayed" as const, row: existing };
      return { kind: "conflict" as const };
    },

    async update(
      userId: string,
      id: string,
      fields: EventFields & { version: number; mutationId: string },
    ) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(calendarEvents)
          .where(and(eq(calendarEvents.userId, userId), eq(calendarEvents.id, id)))
          .limit(1)
          .for("update");
        if (!current) return { kind: "not_found" as const };
        if (
          current.lastMutationId === fields.mutationId &&
          current.version === fields.version + 1 &&
          matchesFields(current, fields)
        ) {
          return { kind: "replayed" as const, row: current };
        }
        if (current.version !== fields.version || current.archivedAt)
          return { kind: "conflict" as const };
        const [updated] = await tx
          .update(calendarEvents)
          .set({
            subjectId: fields.subjectId,
            kind: fields.kind,
            title: fields.title,
            description: fields.description,
            startsAt: fields.startsAt,
            endsAt: fields.endsAt,
            timeZone: fields.timeZone,
            lastMutationId: fields.mutationId,
            version: sql`${calendarEvents.version} + 1`,
            updatedAt: new Date(),
          })
          .where(and(eq(calendarEvents.userId, userId), eq(calendarEvents.id, id)))
          .returning();
        return { kind: "updated" as const, row: updated };
      });
    },

    async setArchived(
      userId: string,
      id: string,
      input: { archived: boolean; version: number; mutationId: string },
    ) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(calendarEvents)
          .where(and(eq(calendarEvents.userId, userId), eq(calendarEvents.id, id)))
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
          .update(calendarEvents)
          .set({
            archivedAt: input.archived ? new Date() : null,
            lastMutationId: input.mutationId,
            version: sql`${calendarEvents.version} + 1`,
            updatedAt: new Date(),
          })
          .where(and(eq(calendarEvents.userId, userId), eq(calendarEvents.id, id)))
          .returning();
        return { kind: "updated" as const, row: updated };
      });
    },
  };
}

export type CalendarEventRepository = ReturnType<typeof createCalendarEventRepository>;
