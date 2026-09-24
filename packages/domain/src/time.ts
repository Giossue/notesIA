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
