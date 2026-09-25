import { Temporal } from "@js-temporal/polyfill";

export function localDateTimeToUtc(localDateTime: string, timeZone: string): string {
  return Temporal.PlainDateTime.from(localDateTime)
    .toZonedDateTime(timeZone, { disambiguation: "reject" })
    .toInstant()
    .toString({ smallestUnit: "millisecond" });
}

export function utcToLocalDateTime(instant: string, timeZone: string): string {
  return Temporal.Instant.from(instant)
    .toZonedDateTimeISO(timeZone)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}

export function localDayBounds(day: string, timeZone: string) {
  const date = Temporal.PlainDate.from(day);
  const start = date.toZonedDateTime(timeZone).toInstant();
  const end = date.add({ days: 1 }).toZonedDateTime(timeZone).toInstant();
  return {
    startsAt: start.toString({ smallestUnit: "millisecond" }),
    endsAt: end.toString({ smallestUnit: "millisecond" }),
  };
}

export function todayInTimeZone(instant: string, timeZone: string): string {
  return Temporal.Instant.from(instant).toZonedDateTimeISO(timeZone).toPlainDate().toString();
}

export function shiftLocalDate(day: string, days: number): string {
  if (!Number.isSafeInteger(days)) throw new RangeError("Day offset must be an integer");
  return Temporal.PlainDate.from(day).add({ days }).toString();
}

export type CalendarRangeView = "day" | "week" | "month";

export function calendarRangeForDate(
  day: string,
  view: CalendarRangeView,
  offset = 0,
): { from: string; through: string } {
  if (!Number.isSafeInteger(offset)) throw new RangeError("Period offset must be an integer");
  const anchor = Temporal.PlainDate.from(day);
  if (view === "day") {
    const from = anchor.add({ days: offset });
    return { from: from.toString(), through: from.add({ days: 1 }).toString() };
  }
  if (view === "week") {
    const shifted = anchor.add({ weeks: offset });
    const from = shifted.subtract({ days: shifted.dayOfWeek - 1 });
    return { from: from.toString(), through: from.add({ days: 7 }).toString() };
  }
  const shifted = anchor.add({ months: offset });
  const from = Temporal.PlainDate.from({ year: shifted.year, month: shifted.month, day: 1 });
  return { from: from.toString(), through: from.add({ months: 1 }).toString() };
}
