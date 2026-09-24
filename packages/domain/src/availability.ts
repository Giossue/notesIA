import { Temporal } from "@js-temporal/polyfill";

export type Interval = { startsAt: string; endsAt: string };
export type Window = { startMinute: number; endMinute: number };
export type WeeklyRule = Window & { weekday: number };
export type DateException = { date: string; windows: Window[] };

function instant(date: string, minute: number, timeZone: string, end: boolean): number {
  const day = Temporal.PlainDate.from(date).add({ days: Math.floor(minute / 1440) });
  const withinDay = minute % 1440;
  const hour = Math.floor(withinDay / 60);
  const minuteOfHour = withinDay % 60;
  return Number(
    day
      .toPlainDateTime({ hour, minute: minuteOfHour })
      .toZonedDateTime(timeZone, { disambiguation: end ? "later" : "compatible" })
      .toInstant().epochMilliseconds,
  );
}

function merge(intervals: Array<[number, number]>): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  for (const [start, end] of intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    if (end <= start) continue;
    const last = result.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else result.push([start, end]);
  }
  return result;
}

function subtract(available: Array<[number, number]>, busy: Array<[number, number]>) {
  let free = available;
  for (const [busyStart, busyEnd] of busy) {
    free = free.flatMap(([start, end]): Array<[number, number]> => {
      if (busyEnd <= start || busyStart >= end) return [[start, end]];
      const parts: Array<[number, number]> = [];
      if (busyStart > start) parts.push([start, busyStart]);
      if (busyEnd < end) parts.push([busyEnd, end]);
      return parts;
    });
  }
  return free;
}

/** Exclusive `through`; all input intervals are half open. */
export function calculateAvailability(input: {
  from: string;
  through: string;
  timeZone: string;
  rules: WeeklyRule[];
  exceptions: DateException[];
  blocked: Interval[];
}) {
  const from = Temporal.PlainDate.from(input.from);
  const through = Temporal.PlainDate.from(input.through);
  const days = from.until(through).days;
  if (days < 1 || days > 31) throw new RangeError("Availability range must be 1 to 31 days");
  const exceptions = new Map(input.exceptions.map((item) => [item.date, item.windows]));
  const blocked = merge(
    input.blocked.map((item) => [Date.parse(item.startsAt), Date.parse(item.endsAt)]),
  );
  const slots: Interval[] = [];
  const daily: Array<{ date: string; availableMinutes: number }> = [];

  for (let offset = 0; offset < days; offset++) {
    const day = from.add({ days: offset });
    const date = day.toString();
    const previous = day.subtract({ days: 1 });
    const windows = exceptions.has(date)
      ? (exceptions.get(date) ?? [])
      : [
          ...input.rules
            .filter((rule) => rule.weekday === day.dayOfWeek)
            .map((rule) => ({
              startMinute: rule.startMinute,
              endMinute: Math.min(rule.endMinute, 1440),
            })),
          ...(!exceptions.has(previous.toString())
            ? input.rules
                .filter((rule) => rule.weekday === previous.dayOfWeek && rule.endMinute > 1440)
                .map((rule) => ({ startMinute: 0, endMinute: rule.endMinute - 1440 }))
            : []),
        ];
    const available = merge(
      windows.map((window): [number, number] => [
        instant(date, window.startMinute, input.timeZone, false),
        instant(date, window.endMinute, input.timeZone, true),
      ]),
    );
    const free = subtract(available, blocked);
    daily.push({
      date,
      availableMinutes: free.reduce((sum, [start, end]) => sum + (end - start) / 60000, 0),
    });
    slots.push(
      ...free.map(([start, end]) => ({
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(end).toISOString(),
      })),
    );
  }
  return {
    slots,
    daily,
    totalMinutes: daily.reduce((sum, day) => sum + day.availableMinutes, 0),
  };
}
