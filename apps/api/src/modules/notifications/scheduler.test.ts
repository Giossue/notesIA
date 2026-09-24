import { expect, test } from "bun:test";
import { isQuietAt } from "@notesia/db";

test("quiet hours use the profile time zone across midnight", () => {
  expect(isQuietAt(new Date("2026-10-05T03:00:00.000Z"), "America/Guayaquil", 1320, 420)).toBe(
    true,
  );
  expect(isQuietAt(new Date("2026-10-05T11:59:00.000Z"), "America/Guayaquil", 1320, 420)).toBe(
    true,
  );
  expect(isQuietAt(new Date("2026-10-05T12:00:00.000Z"), "America/Guayaquil", 1320, 420)).toBe(
    false,
  );
  expect(isQuietAt(new Date("2026-10-05T14:50:00.000Z"), "America/Guayaquil", 540, 600)).toBe(true);
});
