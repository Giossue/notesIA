import { expect, test } from "bun:test";
import { computeStreak, weekStart } from "./streak";

// 2026-10-07 es miércoles.
const today = "2026-10-07";

test("sin días ganados no hay racha", () => {
  const streak = computeStreak([], today);
  expect(streak).toMatchObject({ current: 0, best: 0, todayDone: false, freezeAvailable: true });
  expect(streak.week.map((day) => day.status)).toEqual([
    "missed",
    "missed",
    "pending",
    "future",
    "future",
    "future",
    "future",
  ]);
});

test("hoy sin completar no rompe la racha de ayer", () => {
  const streak = computeStreak(["2026-10-05", "2026-10-06"], today);
  expect(streak.current).toBe(2);
  expect(streak.todayDone).toBe(false);
  expect(computeStreak(["2026-10-05", "2026-10-06", today], today).current).toBe(3);
});

test("el protector salva un día por semana y no suma", () => {
  // Falta el martes 6; el lunes y el miércoles sí.
  const streak = computeStreak(["2026-10-04", "2026-10-05", today], today);
  expect(streak.current).toBe(3);
  expect(streak.freezeAvailable).toBe(false);
  expect(streak.week[1]).toEqual({ date: "2026-10-06", status: "protected" });
});

test("dos días sin tareas en la misma semana cortan la racha", () => {
  const streak = computeStreak(["2026-10-03", "2026-10-04", today], "2026-10-07");
  // Faltan lunes 5 y martes 6: el protector solo cubre un día seguido de uno ganado.
  expect(streak.current).toBe(1);
  expect(streak.best).toBe(2);
});

test("semanas perfectas seguidas hasta la semana pasada", () => {
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 8, 21 + index));
    return date.toISOString().slice(0, 10);
  });
  expect(weekStart("2026-09-27")).toBe("2026-09-21");
  expect(computeStreak(days, today).perfectWeeks).toBe(2);
});
