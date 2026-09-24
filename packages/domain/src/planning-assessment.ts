import { calculateAvailability } from "./availability";
import {
  createDraftPlan,
  type PlannedBlock,
  type PlanningActivity,
  summarizePlan,
  validatePlanBlocks,
} from "./planning";
import { todayInTimeZone } from "./time";

export type PlanningSource = {
  calendar: Parameters<typeof calculateAvailability>[0];
  activities: PlanningActivity[];
  startsAt: string;
  endsAt: string;
};

export type PlanningLimits = {
  minSessionMinutes: number;
  maxSessionMinutes: number;
  maxDailyMinutes: number;
};

export function computePlanning(input: {
  source: PlanningSource;
  lockedBlocks: PlannedBlock[];
  now: string;
  limits: PlanningLimits;
}) {
  const { source, now, limits } = input;
  const base = calculateAvailability(source.calendar);
  if (source.endsAt <= now) return { kind: "horizon_ended" as const };
  const lockedBlocks = input.lockedBlocks.filter((block) => block.endsAt > now);
  if (
    lockedBlocks.some((block) => block.startsAt < source.startsAt || block.endsAt > source.endsAt)
  )
    return { kind: "locked_outside_horizon" as const };
  if (
    !validatePlanBlocks({
      blocks: lockedBlocks,
      freeSlots: base.slots,
      activities: source.activities,
      timeZone: source.calendar.timeZone,
      ...limits,
    })
  )
    return { kind: "locked_invalid" as const };
  const committedMinutesByDate: Record<string, number> = {};
  const lockedMinutes = new Map<string, number>();
  for (const block of lockedBlocks) {
    const minutes = (Date.parse(block.endsAt) - Date.parse(block.startsAt)) / 60000;
    const date = todayInTimeZone(block.startsAt, source.calendar.timeZone);
    committedMinutesByDate[date] = (committedMinutesByDate[date] ?? 0) + minutes;
    lockedMinutes.set(block.activityId, (lockedMinutes.get(block.activityId) ?? 0) + minutes);
  }
  const free = calculateAvailability({
    ...source.calendar,
    blocked: [...source.calendar.blocked, ...lockedBlocks],
  });
  const draft = createDraftPlan({
    now,
    timeZone: source.calendar.timeZone,
    slots: free.slots,
    activities: source.activities.map((activity) => ({
      ...activity,
      remainingMinutes: activity.remainingMinutes - (lockedMinutes.get(activity.id) ?? 0),
    })),
    ...limits,
    committedMinutesByDate,
  });
  const blocks = [...lockedBlocks, ...draft.blocks];
  if (
    !validatePlanBlocks({
      blocks,
      freeSlots: base.slots,
      activities: source.activities,
      timeZone: source.calendar.timeZone,
      ...limits,
    })
  )
    return { kind: "invalid_plan" as const };
  const summary = summarizePlan({
    blocks,
    freeSlots: base.slots,
    activities: source.activities,
    now,
    minSessionMinutes: limits.minSessionMinutes,
    maxSessionMinutes: limits.maxSessionMinutes,
  });
  return {
    kind: "computed" as const,
    blocks,
    lockedBlocks,
    summary,
    algorithmVersion: draft.algorithmVersion,
  };
}
