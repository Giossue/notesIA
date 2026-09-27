import { expect, test } from "bun:test";
import { computeStreak, weekStart } from "./streak";

// 2026-10-07 es miércoles.
const today = "2026-10-07";

test("sin días ganados no hay racha", () => {
  const streak = computeStreak([], today);
  expect(streak).toMatchObject({ current: 0, best: 0, todayDone: false });
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

test("un día con tareas pendientes y sin completar corta la racha", () => {
  const streak = computeStreak(["2026-10-04", "2026-10-05", today], today);
  expect(streak.current).toBe(1);
  expect(streak.best).toBe(2);
  expect(streak.week[1]).toEqual({ date: "2026-10-06", status: "missed" });
});

test("un día sin tareas conserva la racha sin sumar", () => {
  const streak = computeStreak(["2026-10-04", "2026-10-05", today], today, ["2026-10-06"]);
  expect(streak).toMatchObject({ current: 3, best: 3, todayDone: true, todayRest: false });
  expect(streak.week[1]).toEqual({ date: "2026-10-06", status: "rest" });
  expect(computeStreak(["2026-10-05"], today, ["2026-10-06"], true)).toMatchObject({
    current: 1,
    todayDone: false,
    todayRest: true,
  });
});

test("descansar antes de empezar no crea una racha", () => {
  expect(computeStreak([], today, ["2026-10-05", "2026-10-06"], true).current).toBe(0);
});

test("semanas perfectas seguidas hasta la semana pasada", () => {
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 8, 21 + index));
    return date.toISOString().slice(0, 10);
  });
  expect(weekStart("2026-09-27")).toBe("2026-09-21");
  expect(computeStreak(days, today).perfectWeeks).toBe(2);
});
