import { expect, test } from "bun:test";
import { calculateAvailability } from "./availability";

test("splits overnight availability, subtracts overlapping events, and honors a day exception", () => {
  const input = {
    from: "2026-09-28",
    through: "2026-09-30",
    timeZone: "America/Guayaquil",
    rules: [{ weekday: 1, startMinute: 22 * 60, endMinute: 26 * 60 }],
    exceptions: [],
    blocked: [
      { startsAt: "2026-09-29T05:30:00.000Z", endsAt: "2026-09-29T06:00:00.000Z" },
      { startsAt: "2026-09-29T05:45:00.000Z", endsAt: "2026-09-29T06:15:00.000Z" },
    ],
  };
  const first = calculateAvailability(input);
  expect(first.daily).toEqual([
    { date: "2026-09-28", availableMinutes: 120 },
    { date: "2026-09-29", availableMinutes: 75 },
  ]);
  expect(first.totalMinutes).toBe(195);
  expect(first.slots).toEqual([
    { startsAt: "2026-09-29T03:00:00.000Z", endsAt: "2026-09-29T05:00:00.000Z" },
    { startsAt: "2026-09-29T05:00:00.000Z", endsAt: "2026-09-29T05:30:00.000Z" },
    { startsAt: "2026-09-29T06:15:00.000Z", endsAt: "2026-09-29T07:00:00.000Z" },
  ]);

  const exception = calculateAvailability({
    ...input,
    exceptions: [{ date: "2026-09-29", windows: [] }],
  });
  expect(exception.totalMinutes).toBe(120);
});

test("capacity reflects 23 and 25 hour days at DST transitions", () => {
  const base = {
    timeZone: "America/New_York",
    rules: [{ weekday: 7, startMinute: 0, endMinute: 1440 }],
    exceptions: [],
    blocked: [],
  };
  expect(
    calculateAvailability({ ...base, from: "2025-03-09", through: "2025-03-10" }).totalMinutes,
  ).toBe(1380);
  expect(
    calculateAvailability({ ...base, from: "2025-11-02", through: "2025-11-03" }).totalMinutes,
  ).toBe(1500);
});
