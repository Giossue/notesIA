import type { Interval } from "./availability";
import { todayInTimeZone } from "./time";

export const PLANNER_VERSION = "deterministic-v2";

export type PlanningActivity = {
  id: string;
  remainingMinutes: number;
  priority: "low" | "medium" | "high" | "critical";
  startAfterAt: string | null;
  deadlineAt: string | null;
  createdAt: string;
};
export type PlannedBlock = Interval & { activityId: string };
export type UnscheduledWork = {
  activityId: string;
  minutes: number;
  reason: "deadline_passed" | "insufficient_capacity" | "below_min_session";
};
export type RiskAssessment = {
  activityId: string;
  remainingMinutes: number;
  capacityMinutes: number;
  marginMinutes: number;
  level: "low" | "medium" | "high";
  reasons: string[];
};

const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 };
const ceilMinute = (value: number) => Math.ceil(value / 60000) * 60000;
const floorMinute = (value: number) => Math.floor(value / 60000) * 60000;

export function remainingWorkMinutes(input: {
  estimatedMinutes: number;
  progressPercent: number;
  loggedSeconds: number;
}) {
  if (
    !Number.isInteger(input.estimatedMinutes) ||
    input.estimatedMinutes < 0 ||
    !Number.isInteger(input.progressPercent) ||
    input.progressPercent < 0 ||
    input.progressPercent > 100 ||
    !Number.isFinite(input.loggedSeconds) ||
    input.loggedSeconds < 0
  )
    throw new RangeError("Invalid work progress");
  const byProgress = Math.ceil((input.estimatedMinutes * (100 - input.progressPercent)) / 100);
  const byTime = Math.max(0, input.estimatedMinutes - Math.floor(input.loggedSeconds / 60));
  return Math.min(byProgress, byTime);
}

/** Pure, deterministic allocator. All input intervals are UTC and half open. */
export function createDraftPlan(input: {
  now: string;
  timeZone: string;
  slots: Interval[];
  activities: PlanningActivity[];
  minSessionMinutes: number;
  maxSessionMinutes: number;
  maxDailyMinutes: number;
  committedMinutesByDate?: Record<string, number>;
}) {
  if (
    !Number.isInteger(input.minSessionMinutes) ||
    !Number.isInteger(input.maxSessionMinutes) ||
    !Number.isInteger(input.maxDailyMinutes) ||
    input.minSessionMinutes < 1 ||
    input.maxSessionMinutes < input.minSessionMinutes ||
    input.maxDailyMinutes < input.minSessionMinutes
  ) {
    throw new RangeError("Invalid session limits");
  }
  const now = ceilMinute(Date.parse(input.now));
  const slots = input.slots
    .map((slot) => ({
      start: ceilMinute(Date.parse(slot.startsAt)),
      end: floorMinute(Date.parse(slot.endsAt)),
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  if (
    slots.some(
      (slot, index) =>
        slot.end < slot.start || (index > 0 && slot.start < (slots[index - 1]?.end ?? 0)),
    )
  ) {
    throw new RangeError("Free slots overlap or have invalid bounds");
  }
  const activities = [...input.activities].sort(
    (a, b) =>
      (a.deadlineAt ? Date.parse(a.deadlineAt) : Number.POSITIVE_INFINITY) -
        (b.deadlineAt ? Date.parse(b.deadlineAt) : Number.POSITIVE_INFINITY) ||
      priorityRank[a.priority] - priorityRank[b.priority] ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
  const daily = new Map(Object.entries(input.committedMinutesByDate ?? {}));
  const blocks: PlannedBlock[] = [];
  const unscheduled: UnscheduledWork[] = [];
  const remainingById = new Map(
    activities.map((activity) => [activity.id, activity.remainingMinutes]),
  );

  for (const activity of activities) {
    if (!Number.isInteger(activity.remainingMinutes) || activity.remainingMinutes < 0)
      throw new RangeError("Remaining work must be a nonnegative integer");
    let remaining = activity.remainingMinutes;
    const earliest = activity.startAfterAt ? ceilMinute(Date.parse(activity.startAfterAt)) : now;
    const latest = activity.deadlineAt
      ? floorMinute(Date.parse(activity.deadlineAt))
      : Number.POSITIVE_INFINITY;
    for (const slot of slots) {
      if (remaining === 0) break;
      let start = Math.max(slot.start, now, earliest);
      const end = Math.min(slot.end, latest);
      while (remaining > 0 && end - start >= input.minSessionMinutes * 60000) {
        const date = todayInTimeZone(new Date(start).toISOString(), input.timeZone);
        const dayBudget = input.maxDailyMinutes - (daily.get(date) ?? 0);
        let minutes = Math.min(
          input.maxSessionMinutes,
          remaining,
          Math.floor((end - start) / 60000),
          dayBudget,
        );
        if (remaining - minutes > 0 && remaining - minutes < input.minSessionMinutes) {
          minutes = remaining - input.minSessionMinutes;
        }
        if (minutes < input.minSessionMinutes) break;
        const finish = start + minutes * 60000;
        blocks.push({
          activityId: activity.id,
          startsAt: new Date(start).toISOString(),
          endsAt: new Date(finish).toISOString(),
        });
        remaining -= minutes;
        daily.set(date, (daily.get(date) ?? 0) + minutes);
        slot.start = finish;
        start = finish;
      }
    }
    remainingById.set(activity.id, remaining);
    if (remaining > 0)
      unscheduled.push({
        activityId: activity.id,
        minutes: remaining,
        reason:
          latest <= now
            ? "deadline_passed"
            : remaining < input.minSessionMinutes
              ? "below_min_session"
              : "insufficient_capacity",
      });
  }

  const risk: RiskAssessment[] = activities
    .filter((activity) => activity.deadlineAt)
    .map((activity) => {
      const deadline = Date.parse(activity.deadlineAt ?? input.now);
      const earliest = activity.startAfterAt ? Date.parse(activity.startAfterAt) : now;
      const freeBeforeDeadline = slots.reduce(
        (sum, slot) =>
          sum +
          Math.max(0, Math.min(slot.end, deadline) - Math.max(slot.start, now, earliest)) / 60000,
        0,
      );
      const assigned = blocks
        .filter((block) => activity.id === block.activityId)
        .reduce(
          (sum, block) => sum + (Date.parse(block.endsAt) - Date.parse(block.startsAt)) / 60000,
          0,
        );
      const capacityMinutes = Math.floor(freeBeforeDeadline + assigned);
      const marginMinutes = capacityMinutes - activity.remainingMinutes;
      const missing = remainingById.get(activity.id) ?? 0;
      const level =
        deadline <= now || missing > 0 || marginMinutes < 0
          ? "high"
          : marginMinutes < input.maxSessionMinutes
            ? "medium"
            : "low";
      const reasons = [
        ...(deadline <= now ? ["deadline_passed"] : []),
        ...(missing > 0 ? ["work_unscheduled"] : []),
        ...(marginMinutes < 0 ? ["capacity_deficit"] : []),
        ...(level === "medium" ? ["low_margin"] : []),
      ];
      return {
        activityId: activity.id,
        remainingMinutes: activity.remainingMinutes,
        capacityMinutes,
        marginMinutes,
        level,
        reasons,
      };
    });
  return { algorithmVersion: PLANNER_VERSION, blocks, unscheduled, risk };
}

/** Validates a user-edited draft against the same deterministic constraints as preview. */
export function validatePlanBlocks(input: {
  blocks: PlannedBlock[];
  freeSlots: Interval[];
  activities: PlanningActivity[];
  timeZone: string;
  minSessionMinutes: number;
  maxSessionMinutes: number;
  maxDailyMinutes: number;
}) {
  const activities = new Map(input.activities.map((item) => [item.id, item]));
  const assigned = new Map<string, number>();
  const daily = new Map<string, number>();
  let previousEnd = Number.NEGATIVE_INFINITY;
  const blocks = [...input.blocks].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  for (const block of blocks) {
    const start = Date.parse(block.startsAt);
    const end = Date.parse(block.endsAt);
    const activity = activities.get(block.activityId);
    const minutes = (end - start) / 60000;
    if (
      !activity ||
      !Number.isInteger(minutes) ||
      minutes < input.minSessionMinutes ||
      minutes > input.maxSessionMinutes ||
      start < previousEnd ||
      (activity.startAfterAt && start < Date.parse(activity.startAfterAt)) ||
      (activity.deadlineAt && end > Date.parse(activity.deadlineAt)) ||
      !input.freeSlots.some(
        (slot) => start >= Date.parse(slot.startsAt) && end <= Date.parse(slot.endsAt),
      )
    ) {
      return false;
    }
    const date = todayInTimeZone(block.startsAt, input.timeZone);
    if (date !== todayInTimeZone(new Date(end - 1).toISOString(), input.timeZone)) return false;
    const nextAssigned = (assigned.get(block.activityId) ?? 0) + minutes;
    const nextDaily = (daily.get(date) ?? 0) + minutes;
    if (nextAssigned > activity.remainingMinutes || nextDaily > input.maxDailyMinutes) return false;
    assigned.set(block.activityId, nextAssigned);
    daily.set(date, nextDaily);
    previousEnd = end;
  }
  return true;
}

export function summarizePlan(input: {
  blocks: PlannedBlock[];
  freeSlots: Interval[];
  activities: PlanningActivity[];
  now: string;
  minSessionMinutes: number;
  maxSessionMinutes: number;
}) {
  const busy = input.blocks.map(
    (block) => [Date.parse(block.startsAt), Date.parse(block.endsAt)] as const,
  );
  const free = input.freeSlots.flatMap((slot) => {
    let parts: Array<[number, number]> = [[Date.parse(slot.startsAt), Date.parse(slot.endsAt)]];
    for (const [busyStart, busyEnd] of busy)
      parts = parts.flatMap(([start, end]): Array<[number, number]> => {
        if (busyEnd <= start || busyStart >= end) return [[start, end]];
        return [
          ...(busyStart > start ? [[start, busyStart] as [number, number]] : []),
          ...(busyEnd < end ? [[busyEnd, end] as [number, number]] : []),
        ];
      });
    return parts;
  });
  const now = Date.parse(input.now);
  const unscheduled: UnscheduledWork[] = [];
  const risk: RiskAssessment[] = [];
  for (const activity of input.activities) {
    const assigned = input.blocks
      .filter((block) => block.activityId === activity.id)
      .reduce(
        (sum, block) => sum + (Date.parse(block.endsAt) - Date.parse(block.startsAt)) / 60000,
        0,
      );
    const missing = Math.max(0, activity.remainingMinutes - assigned);
    if (missing > 0)
      unscheduled.push({
        activityId: activity.id,
        minutes: missing,
        reason:
          activity.deadlineAt && Date.parse(activity.deadlineAt) <= now
            ? "deadline_passed"
            : missing < input.minSessionMinutes
              ? "below_min_session"
              : "insufficient_capacity",
      });
    if (!activity.deadlineAt) continue;
    const deadline = Date.parse(activity.deadlineAt);
    const earliest = Math.max(now, activity.startAfterAt ? Date.parse(activity.startAfterAt) : now);
    const freeBeforeDeadline = free.reduce(
      (sum, [start, end]) =>
        sum + Math.max(0, Math.min(end, deadline) - Math.max(start, earliest)) / 60000,
      0,
    );
    const capacityMinutes = Math.floor(assigned + freeBeforeDeadline);
    const marginMinutes = capacityMinutes - activity.remainingMinutes;
    const level =
      deadline <= now || missing > 0 || marginMinutes < 0
        ? "high"
        : marginMinutes < input.maxSessionMinutes
          ? "medium"
          : "low";
    risk.push({
      activityId: activity.id,
      remainingMinutes: activity.remainingMinutes,
      capacityMinutes,
      marginMinutes,
      level,
      reasons: [
        ...(deadline <= now ? ["deadline_passed"] : []),
        ...(missing > 0 ? ["work_unscheduled"] : []),
        ...(marginMinutes < 0 ? ["capacity_deficit"] : []),
        ...(level === "medium" ? ["low_margin"] : []),
      ],
    });
  }
  return { unscheduled, risk };
}
