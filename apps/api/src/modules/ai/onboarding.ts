import {
  type AssistantMessage,
  type OnboardingDraft,
  type OnboardingTurnResponse,
  onboardingDraftSchema,
} from "@notesia/contracts";
import type { AiContextRepository } from "@notesia/db";
import { localIso } from "./assistant";
import type { AiGateway } from "./gateway";

const FALLBACK_TIME_ZONE = "America/Guayaquil";

/** "7:5", "07:05" o "07:05:00" → "07:05"; lo que no sea una hora válida → null. */
function clock(value: string) {
  const match = /^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

type RawDraft = {
  studyHours: Array<{ weekday: number; start: string; end: string }>;
  maxDailyMinutes: number | null;
  commitments: Array<{
    title: string;
    kind: string;
    weekdays: number[];
    start: string;
    end: string;
    until: string | null;
  }>;
};

/**
 * Deja el borrador del modelo dentro de las reglas de la app: descarta tramos
 * inválidos, normaliza horas y quita fechas de fin que no existan o ya pasaron
 * (así el agente vuelve a preguntarlas).
 */
export function normalizeDraft(raw: RawDraft, today: string): OnboardingDraft {
  const seen = new Set<string>();
  const studyHours = raw.studyHours.flatMap((row) => {
    const start = clock(row.start);
    const end = clock(row.end);
    if (!start || !end || start === end || row.weekday < 1 || row.weekday > 7) return [];
    const key = `${row.weekday}-${start}-${end}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ weekday: row.weekday, start, end }];
  });
  const commitments = raw.commitments.flatMap((row) => {
    const title = row.title.trim().slice(0, 120);
    const start = clock(row.start);
    const end = clock(row.end);
    const weekdays = [...new Set(row.weekdays)].filter((day) => day >= 1 && day <= 7).sort();
    if (!title || !start || !end || start === end || weekdays.length === 0) return [];
    const until =
      row.until && /^\d{4}-\d{2}-\d{2}$/.test(row.until) && row.until >= today ? row.until : null;
    const kind = (["class", "work", "other"] as const).find((item) => item === row.kind) ?? "other";
    return [{ title, kind, weekdays, start, end, until }];
  });
  const daily = raw.maxDailyMinutes;
  return onboardingDraftSchema.parse({
    studyHours: studyHours.slice(0, 28),
    maxDailyMinutes:
      daily === null || !Number.isFinite(daily) ? null : Math.min(720, Math.max(30, daily)),
    commitments: commitments.slice(0, 20),
  });
}

/** Lo mínimo para guardar: un horario de estudio y fecha de fin en cada compromiso. */
export const draftReady = (draft: OnboardingDraft) =>
  draft.studyHours.length > 0 && draft.commitments.every((item) => item.until !== null);

type TurnDependencies = { gateway: AiGateway; context: AiContextRepository };

/** Un mensaje de la configuración inicial: una llamada al modelo, nada se guarda. */
export async function runOnboardingTurn(
  dependencies: TurnDependencies,
  userId: string,
  request: { message: string; history: AssistantMessage[]; draft: OnboardingDraft },
  now: Date = new Date(),
): Promise<OnboardingTurnResponse | { kind: "consent_required" } | { kind: "invalid_input" }> {
  const timeZone = (await dependencies.context.assistantTimeZone(userId)) ?? FALLBACK_TIME_ZONE;
  const local = localIso(now, timeZone);
  const today = local.slice(0, 10);
  const weekday = new Intl.DateTimeFormat("es", { timeZone, weekday: "long" }).format(now);
  const result = await dependencies.gateway.suggest(userId, "onboarding_setup", {
    message: request.message,
    history: request.history,
    today: `${today} (${weekday})`,
    draft: request.draft,
  });
  if (result.kind !== "suggestion") return result;
  const value = result.value as { reply: string; complete: boolean; draft: RawDraft };
  const draft = normalizeDraft(value.draft, today);
  return {
    kind: "reply",
    reply: value.reply,
    draft,
    complete: value.complete && draftReady(draft),
  };
}
