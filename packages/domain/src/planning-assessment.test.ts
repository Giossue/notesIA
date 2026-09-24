import { expect, test } from "bun:test";
import { computePlanning } from "./planning-assessment";

const source = {
  calendar: {
    from: "2026-10-05",
    through: "2026-10-06",
    timeZone: "Etc/UTC",
    rules: [{ weekday: 1, startMinute: 540, endMinute: 720 }],
    exceptions: [],
    blocked: [],
  },
  activities: [
    {
      id: "activity-1",
      remainingMinutes: 60,
      priority: "high" as const,
      startAfterAt: null,
      deadlineAt: "2026-10-05T12:00:00.000Z",
      createdAt: "2026-09-24T12:00:00.000Z",
    },
  ],
  startsAt: "2026-10-05T00:00:00.000Z",
  endsAt: "2026-10-06T00:00:00.000Z",
};
const limits = { minSessionMinutes: 25, maxSessionMinutes: 90, maxDailyMinutes: 240 };
const now = "2026-10-05T08:00:00.000Z";

test("assessment preserves valid locked work and reports current risk", () => {
  const locked = {
    activityId: "activity-1",
    startsAt: "2026-10-05T09:00:00.000Z",
    endsAt: "2026-10-05T10:00:00.000Z",
  };
  const result = computePlanning({ source, lockedBlocks: [locked], now, limits });
  expect(result.kind).toBe("computed");
  if (result.kind !== "computed") return;
  expect(result.blocks).toEqual([locked]);
  expect(result.summary.unscheduled).toEqual([]);
  expect(result.summary.risk).toMatchObject([{ activityId: "activity-1", level: "low" }]);
  expect(computePlanning({ source, lockedBlocks: [locked], now, limits })).toEqual(result);
});

test("assessment reports a conflicting locked block and an ended horizon", () => {
  expect(
    computePlanning({
      source,
      lockedBlocks: [
        {
          activityId: "activity-1",
          startsAt: "2026-10-06T09:00:00.000Z",
          endsAt: "2026-10-06T10:00:00.000Z",
        },
      ],
      now,
      limits,
    }).kind,
  ).toBe("locked_outside_horizon");
  expect(
    computePlanning({ source, lockedBlocks: [], now: "2026-10-06T00:00:00.000Z", limits }).kind,
  ).toBe("horizon_ended");
});
