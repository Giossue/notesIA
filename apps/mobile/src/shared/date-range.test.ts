import { describe, expect, test } from "bun:test";
import { exclusiveDateRangeSchema } from "./date-range";

describe("exclusive date ranges", () => {
  test("accepts one to thirty-one calendar days", () => {
    expect(
      exclusiveDateRangeSchema.safeParse({ from: "2026-01-01", through: "2026-02-01" }).success,
    ).toBe(true);
  });

  test("rejects empty, reversed, and overlong ranges", () => {
    expect(
      exclusiveDateRangeSchema.safeParse({ from: "2026-01-01", through: "2026-01-01" }).success,
    ).toBe(false);
    expect(
      exclusiveDateRangeSchema.safeParse({ from: "2026-01-02", through: "2026-01-01" }).success,
    ).toBe(false);
    expect(
      exclusiveDateRangeSchema.safeParse({ from: "2026-01-01", through: "2026-02-02" }).success,
    ).toBe(false);
  });
});
