import type { OnboardingDraft } from "@notesia/contracts";
import { localDateTimeToUtc, shiftLocalDate } from "@notesia/domain";
import { v4 as uuidv4 } from "uuid";
import { createAvailabilityRule } from "@/core/api/availability";
import { createCalendarEvent } from "@/core/api/calendar-events";
import { getPreferences, updatePreferences } from "@/core/api/preferences";
import { completeOnboarding, getProfile } from "@/core/api/profile";
import { clockToMinute } from "@/features/availability/time";
import {
  closestDaily,
  type HourSlot,
  toMinutes,
  weekdays,
} from "@/features/availability/WeeklyHours";
import { saveTimeZone } from "@/shared/time-zones";

export type CommitmentKind = "class" | "work" | "other";
/** Un compromiso fijo: se repite cada semana en los días elegidos hasta `until`. */
export type Commitment = {
  key: string;
  title: string;
  kind: CommitmentKind;
  days: number[];
  start: string;
  end: string;
  until: string;
};
/** La semana tal como se guarda, venga del agente o del formulario. */
export type WeekSetup = { days: HourSlot[][]; daily: string; commitments: Commitment[] };

/** Tope de semanas que se crean por compromiso: un año. */
const MAX_WEEKS = 52;

/** Primera fecha desde `from` que cae en el día de la semana (1 = lunes). */
export function firstOnWeekday(from: string, weekday: number) {
  const [year, month, day] = from.split("-").map(Number);
  const current =
    ((new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)).getUTCDay() + 6) % 7) + 1;
  return shiftLocalDate(from, (weekday - current + 7) % 7);
}

/** Borrador del agente → semana editable (los compromisos sin fecha de fin usan `defaultUntil`). */
export function fromDraft(draft: OnboardingDraft, defaultUntil: string): WeekSetup {
  return {
    days: weekdays.map((_, index) =>
      draft.studyHours
        .filter((row) => row.weekday === index + 1)
        .map((row) => ({ key: uuidv4(), start: row.start, end: row.end })),
    ),
    daily: closestDaily(draft.maxDailyMinutes ?? 180),
    commitments: draft.commitments.map((item) => ({
      key: uuidv4(),
      title: item.title,
      kind: item.kind,
      days: item.weekdays,
      start: item.start,
      end: item.end,
      until: item.until ?? defaultUntil,
    })),
  };
}

/**
 * Guarda la semana: zona horaria del teléfono, horario de estudio, máximo diario,
 * cada compromiso semana por semana y, al final, marca terminada la
 * configuración. `eventIds` conserva los ids entre reintentos para no duplicar.
 */
export async function saveWeek({
  setup,
  timeZone,
  today,
  eventIds,
  onProgress,
}: {
  setup: WeekSetup;
  timeZone: string;
  today: string;
  eventIds: Map<string, string>;
  onProgress(saved: number, total: number): void;
}) {
  // Perfil fresco: al reintentar la zona ya puede estar guardada.
  const current = await getProfile();
  if (current.timeZone !== timeZone) await saveTimeZone(current, timeZone);
  const occurrences = setup.commitments.flatMap((item) =>
    item.days.flatMap((weekday) => {
      const dates: string[] = [];
      for (
        let date = firstOnWeekday(today, weekday);
        date <= item.until && dates.length < MAX_WEEKS;
        date = shiftLocalDate(date, 7)
      )
        dates.push(date);
      return dates.map((date) => ({ item, date }));
    }),
  );
  const rules = setup.days.flatMap((slots, index) =>
    slots.map((slot) => ({ slot, weekday: index + 1 })),
  );
  const total = rules.length + occurrences.length + 2;
  let saved = 0;
  const step = () => onProgress(++saved, total);
  onProgress(0, total);

  for (const { slot, weekday } of rules) {
    await createAvailabilityRule({ id: slot.key, weekday, ...toMinutes(slot.start, slot.end) });
    step();
  }
  const preferences = await getPreferences();
  const minutes = Number(setup.daily);
  await updatePreferences({
    minSessionMinutes: Math.min(preferences.minSessionMinutes, minutes),
    maxSessionMinutes: preferences.maxSessionMinutes,
    maxDailyMinutes: minutes,
    notificationsEnabled: preferences.notificationsEnabled,
    quietStartMinute: preferences.quietStartMinute,
    quietEndMinute: preferences.quietEndMinute,
    version: preferences.version,
  });
  step();
  // De a varios a la vez: un ciclo completo puede ser un centenar de compromisos.
  for (let index = 0; index < occurrences.length; index += 8) {
    await Promise.all(
      occurrences.slice(index, index + 8).map(async ({ item, date }) => {
        const key = `${item.key}-${date}`;
        const id = eventIds.get(key) ?? uuidv4();
        eventIds.set(key, id);
        const overnight = clockToMinute(item.end) <= clockToMinute(item.start);
        await createCalendarEvent({
          id,
          kind: item.kind,
          title: item.title,
          description: null,
          startsAt: localDateTimeToUtc(`${date}T${item.start}`, timeZone),
          endsAt: localDateTimeToUtc(
            `${overnight ? shiftLocalDate(date, 1) : date}T${item.end}`,
            timeZone,
          ),
          timeZone,
        });
        step();
      }),
    );
  }
  const updated = await completeOnboarding();
  step();
  return updated;
}
