import { Temporal } from "@js-temporal/polyfill";
import { shiftLocalDate } from "./time";

export type StreakDayStatus = "done" | "missed" | "pending" | "future";

export type Streak = {
  /** Días seguidos ganados; hoy sin completar todavía no la rompe. */
  current: number;
  best: number;
  todayDone: boolean;
  /** Semanas completas seguidas (las 7 con tarea) hasta la semana pasada. */
  perfectWeeks: number;
  /** Semana actual, de lunes a domingo. */
  week: Array<{ date: string; status: StreakDayStatus }>;
};

/** Lunes de la semana del día. */
export function weekStart(day: string) {
  const date = Temporal.PlainDate.from(day);
  return date.subtract({ days: date.dayOfWeek - 1 }).toString();
}

/**
 * Racha a partir de los días ganados (fechas locales AAAA-MM-DD). Un día sin
 * tareas completadas la corta; hoy todavía no, porque el día no terminó.
 */
export function computeStreak(doneDays: Iterable<string>, today: string): Streak {
  const done = new Set([...doneDays].filter((day) => day <= today));
  let current = 0;
  let best = 0;
  const first = [...done].sort()[0];
  if (first) {
    for (let day = first; day <= today; day = shiftLocalDate(day, 1)) {
      if (done.has(day)) {
        current += 1;
        best = Math.max(best, current);
      } else if (day !== today) current = 0;
    }
  }

  const monday = weekStart(today);
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = shiftLocalDate(monday, index);
    const status: StreakDayStatus = done.has(date)
      ? "done"
      : date === today
        ? "pending"
        : date > today
          ? "future"
          : "missed";
    return { date, status };
  });

  let perfectWeeks = 0;
  for (let start = shiftLocalDate(monday, -7); ; start = shiftLocalDate(start, -7)) {
    const full = Array.from({ length: 7 }, (_, index) => shiftLocalDate(start, index)).every(
      (day) => done.has(day),
    );
    if (!full) break;
    perfectWeeks += 1;
  }

  return {
    current,
    best,
    todayDone: done.has(today),
    perfectWeeks,
    week,
  };
}
