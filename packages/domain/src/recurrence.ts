import { Temporal } from "@js-temporal/polyfill";
import { localDayBounds } from "./time";

export const MAX_RECURRENCE_OCCURRENCES = 60;

export type RecurrenceFrequency = "daily" | "weekly";
export type RecurrenceOccurrence = {
  occursOn: string;
  startAfterAt: string;
  deadlineAt: string;
};

export function expandRecurrence(input: {
  frequency: RecurrenceFrequency;
  startOn: string;
  throughOn: string;
  timeZone: string;
}): RecurrenceOccurrence[] {
  const start = Temporal.PlainDate.from(input.startOn);
  const through = Temporal.PlainDate.from(input.throughOn);
  if (Temporal.PlainDate.compare(through, start) < 0 || start.until(through).days > 366)
    throw new RangeError("Recurrence range must be within 366 days");
  const step = input.frequency === "daily" ? 1 : input.frequency === "weekly" ? 7 : null;
  if (!step) throw new RangeError("Unsupported recurrence frequency");
  const occurrences: RecurrenceOccurrence[] = [];
  for (
    let day = start;
    Temporal.PlainDate.compare(day, through) <= 0;
    day = day.add({ days: step })
  ) {
    if (occurrences.length >= MAX_RECURRENCE_OCCURRENCES)
      throw new RangeError("Recurrence exceeds the instance limit");
    const bounds = localDayBounds(day.toString(), input.timeZone);
    occurrences.push({
      occursOn: day.toString(),
      startAfterAt: bounds.startsAt,
      deadlineAt: new Date(Date.parse(bounds.endsAt) - 1).toISOString(),
    });
  }
  return occurrences;
}
