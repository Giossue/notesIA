import { Temporal } from "@js-temporal/polyfill";
import { shiftLocalDate } from "./time";

export type StreakDayStatus = "done" | "rest" | "missed" | "pending" | "future";

export type Streak = {
  /** Días seguidos ganados; hoy sin completar todavía no la rompe. */
  current: number;
  best: number;
  todayDone: boolean;
  todayRest: boolean;
  /** Semanas completas seguidas (días ganados o de descanso) hasta la pasada. */
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
 * La racha suma solo días ganados. Un día de descanso conserva el valor sin
 * aumentarlo; un día con una entrega pendiente y sin completar ninguna la corta.
 */
export function computeStreak(
  doneDays: Iterable<string>,
  today: string,
  restDays: Iterable<string> = [],
  todayRest = false,
): Streak {
  const done = new Set([...doneDays].filter((day) => day <= today));
  const rest = new Set([...restDays].filter((day) => day <= today && !done.has(day)));
  let current = 0;
  let best = 0;
  const first = [...done].sort()[0];
  if (first) {
    for (let day = first; day <= today; day = shiftLocalDate(day, 1)) {
      if (done.has(day)) {
        current += 1;
        best = Math.max(best, current);
      } else if (day !== today && !rest.has(day)) current = 0;
    }
  }

  const monday = weekStart(today);
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = shiftLocalDate(monday, index);
    const status: StreakDayStatus = done.has(date)
      ? "done"
      : rest.has(date) || (date === today && todayRest)
        ? "rest"
        : date === today
          ? "pending"
          : date > today
            ? "future"
            : "missed";
    return { date, status };
  });

  let perfectWeeks = 0;
  for (let start = shiftLocalDate(monday, -7); ; start = shiftLocalDate(start, -7)) {
    const days = Array.from({ length: 7 }, (_, index) => shiftLocalDate(start, index));
    const full =
      days.some((day) => done.has(day)) && days.every((day) => done.has(day) || rest.has(day));
    if (!full) break;
    perfectWeeks += 1;
  }

  return {
    current,
    best,
    todayDone: done.has(today),
    todayRest: !done.has(today) && (rest.has(today) || todayRest),
    perfectWeeks,
    week,
  };
}
