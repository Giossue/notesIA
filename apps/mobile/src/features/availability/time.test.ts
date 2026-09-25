import { describe, expect, test } from "bun:test";
import { clockToMinute, minuteToClock, parseWindows, windowsToText } from "./time";

describe("availability time input", () => {
  test("converts local clock values and formats intervals", () => {
    expect(clockToMinute("08:30")).toBe(510);
    expect(minuteToClock(1530)).toBe("01:30");
    const windows = parseWindows("08:00-10:00, 14:30-16:00");
    expect(windows).toEqual([
      { startMinute: 480, endMinute: 600 },
      { startMinute: 870, endMinute: 960 },
    ]);
    expect(windowsToText(windows)).toBe("08:00-10:00, 14:30-16:00");
  });

  test("rejects invalid or reversed intervals", () => {
    expect(() => clockToMinute("25:00")).toThrow("no es válida");
    expect(() => parseWindows("10:00-09:00")).toThrow("terminar después");
  });
});
