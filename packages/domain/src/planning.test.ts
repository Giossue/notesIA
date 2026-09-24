import { expect, test } from "bun:test";
import { createDraftPlan, remainingWorkMinutes } from "./planning";

test("remaining work uses progress or logged time without subtracting both", () => {
  expect(
    remainingWorkMinutes({ estimatedMinutes: 120, progressPercent: 50, loggedSeconds: 1800 }),
  ).toBe(60);
  expect(
    remainingWorkMinutes({ estimatedMinutes: 120, progressPercent: 50, loggedSeconds: 5400 }),
  ).toBe(30);
  expect(
    remainingWorkMinutes({ estimatedMinutes: 120, progressPercent: 0, loggedSeconds: 3600 }),
  ).toBe(60);
  expect(() =>
    remainingWorkMinutes({ estimatedMinutes: 120, progressPercent: 101, loggedSeconds: 0 }),
  ).toThrow();
});

const base = {
  now: "2026-09-28T12:00:00.000Z",
  timeZone: "America/Guayaquil",
  slots: [
    { startsAt: "2026-09-28T13:00:00.000Z", endsAt: "2026-09-28T16:00:00.000Z" },
    { startsAt: "2026-09-29T13:00:00.000Z", endsAt: "2026-09-29T15:00:00.000Z" },
  ],
  minSessionMinutes: 25,
  maxSessionMinutes: 90,
  maxDailyMinutes: 180,
};

test("planner is deterministic and respects deadlines, priority, daily limits and remaining work", () => {
  const urgent = {
    id: "urgent",
    remainingMinutes: 120,
    priority: "medium" as const,
    startAfterAt: null,
    deadlineAt: "2026-09-28T16:00:00.000Z",
    createdAt: "2026-09-01T00:00:00.000Z",
  };
  const later = {
    id: "later",
    remainingMinutes: 120,
    priority: "critical" as const,
    startAfterAt: null,
    deadlineAt: "2026-09-30T00:00:00.000Z",
    createdAt: "2026-09-01T00:00:00.000Z",
  };
  const input = { ...base, activities: [later, urgent] };
  const first = createDraftPlan(input);
  expect(first).toEqual(createDraftPlan(input));
  expect(first.blocks[0]?.activityId).toBe("urgent");
  expect(first.unscheduled).toEqual([]);
  for (const activity of [urgent, later]) {
    const assigned = first.blocks
      .filter((block) => block.activityId === activity.id)
      .reduce(
        (sum, block) => sum + (Date.parse(block.endsAt) - Date.parse(block.startsAt)) / 60000,
        0,
      );
    expect(assigned).toBe(activity.remainingMinutes);
    expect(
      first.blocks
        .filter((block) => block.activityId === activity.id)
        .every((block) => !activity.deadlineAt || block.endsAt <= activity.deadlineAt),
    ).toBe(true);
  }
  const chronological = [...first.blocks].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  expect(
    chronological.every(
      (block, index) => index === 0 || (chronological[index - 1]?.endsAt ?? "") <= block.startsAt,
    ),
  ).toBe(true);
  expect(first.risk.find((item) => item.activityId === "urgent")?.level).toBeDefined();
});

test("planner reports unplaced work and rejects overlapping free slots", () => {
  const task = {
    id: "task",
    remainingMinutes: 300,
    priority: "high" as const,
    startAfterAt: null,
    deadlineAt: "2026-09-28T14:00:00.000Z",
    createdAt: "2026-09-01T00:00:00.000Z",
  };
  const result = createDraftPlan({ ...base, activities: [task] });
  expect(result.unscheduled).toEqual([
    { activityId: "task", minutes: 240, reason: "insufficient_capacity" },
  ]);
  expect(result.risk[0]).toMatchObject({
    level: "high",
    reasons: ["work_unscheduled", "capacity_deficit"],
  });
  const firstSlot = base.slots.at(0);
  if (!firstSlot) throw new Error("Missing test slot");
  expect(() =>
    createDraftPlan({ ...base, activities: [task], slots: [firstSlot, firstSlot] }),
  ).toThrow();
});
