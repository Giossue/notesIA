import { expect, test } from "bun:test";
import {
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
