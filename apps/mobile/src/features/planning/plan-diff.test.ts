import { describe, expect, test } from "bun:test";
import { diffPlanBlocks } from "./plan-diff";

describe("plan block differences", () => {
  test("keeps identical blocks out and classifies moves, additions, and removals", () => {
    const same = {
      activityId: "a",
      startsAt: "2026-09-25T10:00:00.000Z",
      endsAt: "2026-09-25T11:00:00.000Z",
    };
    const moved = {
      activityId: "b",
      startsAt: "2026-09-25T12:00:00.000Z",
      endsAt: "2026-09-25T13:00:00.000Z",
    };
    const changes = diffPlanBlocks(
      [
        same,
        moved,
        {
          activityId: "c",
          startsAt: "2026-09-25T14:00:00.000Z",
          endsAt: "2026-09-25T15:00:00.000Z",
        },
      ],
      [
        same,
        {
          ...moved,
          startsAt: "2026-09-26T12:00:00.000Z",
          endsAt: "2026-09-26T13:00:00.000Z",
        },
        {
          activityId: "d",
          startsAt: "2026-09-25T16:00:00.000Z",
          endsAt: "2026-09-25T17:00:00.000Z",
        },
      ],
    );
    expect(changes.map((item) => [item.kind, item.activityId])).toEqual([
      ["moved", "b"],
      ["removed", "c"],
      ["added", "d"],
    ]);
  });
});
