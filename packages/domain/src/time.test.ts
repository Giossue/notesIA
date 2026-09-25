import { expect, test } from "bun:test";
import {
  calendarRangeForDate,
  localDateTimeToUtc,
  localDayBounds,
  shiftLocalDate,
  todayInTimeZone,
  utcToLocalDateTime,
} from "./time";

test("converts a Guayaquil deadline and back without using the device zone", () => {
  const instant = localDateTimeToUtc("2026-09-23T18:00", "America/Guayaquil");
  expect(instant).toBe("2026-09-23T23:00:00.000Z");
  expect(utcToLocalDateTime(instant, "America/Guayaquil")).toBe("2026-09-23T18:00");
  expect(todayInTimeZone("2026-09-24T02:00:00Z", "America/Guayaquil")).toBe("2026-09-23");
});

test("rejects ambiguous and nonexistent local deadline times", () => {
  expect(() => localDateTimeToUtc("2025-03-09T02:30", "America/New_York")).toThrow();
  expect(() => localDateTimeToUtc("2025-11-02T01:30", "America/New_York")).toThrow();
});

test("daily bounds follow daylight saving changes", () => {
  const bounds = localDayBounds("2025-03-09", "America/New_York");
  expect(Date.parse(bounds.endsAt) - Date.parse(bounds.startsAt)).toBe(23 * 60 * 60 * 1000);
});

test("shifts calendar days across month boundaries", () => {
  expect(shiftLocalDate("2026-09-30", 1)).toBe("2026-10-01");
  expect(shiftLocalDate("2026-03-01", -1)).toBe("2026-02-28");
});

test("builds exclusive daily, Monday-based weekly, and calendar month ranges", () => {
  expect(calendarRangeForDate("2026-09-25", "day")).toEqual({
    from: "2026-09-25",
    through: "2026-09-26",
  });
  expect(calendarRangeForDate("2026-09-27", "week")).toEqual({
    from: "2026-09-21",
    through: "2026-09-28",
  });
  expect(calendarRangeForDate("2024-02-29", "month")).toEqual({
    from: "2024-02-01",
    through: "2024-03-01",
  });
  expect(calendarRangeForDate("2026-01-31", "month", 1)).toEqual({
    from: "2026-02-01",
    through: "2026-03-01",
  });
});
