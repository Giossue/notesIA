import { expect, test } from "bun:test";
import { expandRecurrence } from "./recurrence";

test("daily recurrence keeps local dates across a daylight saving transition", () => {
  const rows = expandRecurrence({
    frequency: "daily",
    startOn: "2026-03-07",
    throughOn: "2026-03-09",
    timeZone: "America/New_York",
  });
  expect(rows.map((row) => row.occursOn)).toEqual(["2026-03-07", "2026-03-08", "2026-03-09"]);
  expect(Date.parse(rows[1]?.deadlineAt ?? "") - Date.parse(rows[1]?.startAfterAt ?? "")).toBe(
    23 * 60 * 60 * 1000 - 1,
  );
  expect(Date.parse(rows[0]?.deadlineAt ?? "") + 1).toBe(Date.parse(rows[1]?.startAfterAt ?? ""));
});

test("weekly recurrence is finite and rejects excessive generation", () => {
  const rows = expandRecurrence({
    frequency: "weekly",
    startOn: "2026-01-05",
    throughOn: "2026-01-26",
    timeZone: "America/Guayaquil",
  });
  expect(rows.map((row) => row.occursOn)).toEqual([
    "2026-01-05",
    "2026-01-12",
    "2026-01-19",
    "2026-01-26",
  ]);
  expect(() =>
    expandRecurrence({
      frequency: "daily",
      startOn: "2026-01-01",
      throughOn: "2026-03-03",
      timeZone: "America/Guayaquil",
    }),
  ).toThrow();
  expect(() =>
    expandRecurrence({
      frequency: "weekly",
      startOn: "2026-01-26",
      throughOn: "2026-01-05",
      timeZone: "America/Guayaquil",
    }),
  ).toThrow();
});
