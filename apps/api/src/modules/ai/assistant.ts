import {
  type AssistantAction,
  type AssistantMessage,
  type AssistantTurnResponse,
  assistantActionSchema,
} from "@notesia/contracts";
import type { AiContextRepository } from "@notesia/db";
import { type AssistantFlatAction, type AssistantQuery, redactInput } from "./cases";
import type { AiGateway } from "./gateway";

const DAY_MS = 86_400_000;
const MAX_RANGE_MS = 62 * DAY_MS;
const FALLBACK_TIME_ZONE = "America/Guayaquil";

/** "2026-10-02T10:00:00-05:00": la hora local del estudiante con su desfase. */
export function localIso(date: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offset = Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  const sign = offset < 0 ? "-" : "+";
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
  const minutes = String(Math.abs(offset) % 60).padStart(2, "0");
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${sign}${hours}:${minutes}`;
}

/** "miércoles 30 sep, 23:59": el día ya calculado, para que el modelo no lo deduzca. */
export function localLabel(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("es", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(date)
    .replaceAll(".", "");
}

/** Fecha del modelo en ISO UTC, solo dentro de una ventana razonable (ayer a dos años). */
function modelDate(value: string | null, now: Date) {
  if (!value) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return undefined;
  if (time < now.getTime() - DAY_MS || time > now.getTime() + 730 * DAY_MS) return undefined;
  return new Date(time).toISOString();
}

type Known = Map<string, { kind: "activity" | "event"; title: string }>;

/** Resuelve las consultas del modelo con los datos del propio estudiante. */
export async function resolveQueries(
  context: AiContextRepository,
  userId: string,
  queries: AssistantQuery[],
  timeZone: string,
  now: Date,
) {
  const known: Known = new Map();
  const activities: Record<string, unknown>[] = [];
  const events: Record<string, unknown>[] = [];
  const bound = (value: string | null) => {
    const time = value ? Date.parse(value) : Number.NaN;
    return Number.isFinite(time) ? new Date(time) : null;
  };
  for (const query of queries.slice(0, 3)) {
    let from = bound(query.from);
    let to = bound(query.to);
    if (from && to && (to <= from || to.getTime() - from.getTime() > MAX_RANGE_MS)) to = null;
    if (query.type === "activities") {
      const rows = await context.assistantActivities(userId, {
        // Cadena vacía = sin filtro.
        text: query.text?.trim().slice(0, 80) || null,
        open: !query.includeDone,
        from,
        to,
      });
      for (const row of rows) {
        if (known.has(row.id)) continue;
        known.set(row.id, { kind: "activity", title: row.title });
        activities.push({
          id: row.id,
          title: redactInput(row.title.slice(0, 120)),
          kind: row.kind,
          priority: row.priority,
          status: row.status,
          progressPercent: row.progressPercent,
          estimatedMinutes: row.estimatedMinutes,
          startAfterAt: row.startAfterAt ? localIso(row.startAfterAt, timeZone) : null,
          deadlineAt: row.deadlineAt ? localIso(row.deadlineAt, timeZone) : null,
          deadlineLabel: row.deadlineAt ? localLabel(row.deadlineAt, timeZone) : null,
        });
      }
    } else {
      from ??= now;
      if (!to || to <= from) to = new Date(from.getTime() + 7 * DAY_MS);
      if (to.getTime() - from.getTime() > MAX_RANGE_MS)
        to = new Date(from.getTime() + MAX_RANGE_MS);
      const rows = await context.assistantEvents(userId, from, to);
      for (const row of rows) {
        if (known.has(row.id)) continue;
        known.set(row.id, { kind: "event", title: row.title });
        events.push({
          id: row.id,
          title: redactInput(row.title.slice(0, 120)),
          kind: row.kind,
          startsAt: localIso(row.startsAt, timeZone),
          startsLabel: localLabel(row.startsAt, timeZone),
          endsAt: localIso(row.endsAt, timeZone),
        });
      }
    }
  }
  return {
    results: { activities: activities.slice(0, 30), events: events.slice(0, 30) },
    known,
  };
}

/**
 * Convierte la acción plana del modelo en una acción tipada y la valida con los
 * mismos esquemas de la app. Descarta la que no cumpla o apunte a un id que el
 * servidor no le mostró en este turno.
 */
export function toAssistantAction(
  flat: AssistantFlatAction,
  known: Known,
  timeZone: string,
  now: Date,
): AssistantAction | null {
  const dates = {
    startAfterAt: modelDate(flat.startAfterAt, now),
    deadlineAt: modelDate(flat.deadlineAt, now),
    startsAt: modelDate(flat.startsAt, now),
    endsAt: modelDate(flat.endsAt, now),
  };
  if (Object.values(dates).includes(undefined)) return null;
  const activity = flat.activityId ? known.get(flat.activityId) : undefined;
  const event = flat.eventId ? known.get(flat.eventId) : undefined;
  const activityTarget =
    activity?.kind === "activity" && flat.activityId
      ? { activityId: flat.activityId, title: activity.title }
      : null;
  const eventTarget =
    event?.kind === "event" && flat.eventId ? { eventId: flat.eventId, title: event.title } : null;
  const defined = <T extends Record<string, unknown>>(value: T) =>
    Object.fromEntries(
      Object.entries(value).filter(([, item]) => item !== null && item !== undefined),
    );
  let candidate: unknown;
  switch (flat.type) {
    case "create_activity":
      candidate = {
        type: flat.type,
        activity: {
          kind: flat.kind ?? "academic_task",
          title: flat.title,
          description: flat.description || null,
          priority: flat.priority ?? "medium",
          startAfterAt: dates.startAfterAt ?? null,
          deadlineAt: dates.deadlineAt ?? null,
          estimatedMinutes: flat.estimatedMinutes,
        },
      };
      break;
    case "update_activity":
      if (!activityTarget) return null;
      candidate = {
        type: flat.type,
        ...activityTarget,
        changes: defined({
          kind: flat.kind,
          title: flat.title,
          description: flat.description,
          priority: flat.priority,
          startAfterAt: dates.startAfterAt,
          deadlineAt: dates.deadlineAt,
          estimatedMinutes: flat.estimatedMinutes,
        }),
      };
      break;
    case "set_activity_progress":
      if (!activityTarget) return null;
      candidate = { type: flat.type, ...activityTarget, progressPercent: flat.progressPercent };
      break;
    case "transition_activity":
      if (!activityTarget) return null;
      candidate = { type: flat.type, ...activityTarget, transition: flat.transition };
      break;
    case "delete_activity":
      if (!activityTarget) return null;
      candidate = { type: flat.type, ...activityTarget };
      break;
    case "create_subtasks":
      if (!activityTarget) return null;
      candidate = {
        type: flat.type,
        ...activityTarget,
        subtasks: (flat.subtasks ?? []).map((title) => ({ title, estimatedMinutes: null })),
      };
      break;
    case "create_event": {
      const startsAt = dates.startsAt;
      const endsAt =
        dates.endsAt ??
        (startsAt ? new Date(Date.parse(startsAt) + 3_600_000).toISOString() : null);
      candidate = {
        type: flat.type,
        event: {
          kind: flat.kind ?? "other",
          title: flat.title,
          description: flat.description || null,
          startsAt,
          endsAt,
          timeZone,
        },
      };
      break;
    }
    case "update_event":
      if (!eventTarget) return null;
      candidate = {
        type: flat.type,
        ...eventTarget,
        changes: defined({
          kind: flat.kind,
          title: flat.title,
          description: flat.description,
          startsAt: dates.startsAt,
          endsAt: dates.endsAt,
        }),
      };
      break;
    case "archive_event":
      if (!eventTarget) return null;
      candidate = { type: flat.type, ...eventTarget };
      break;
  }
  const parsed = assistantActionSchema.safeParse(candidate);
  if (!parsed.success) return null;
  if (
    (parsed.data.type === "update_activity" || parsed.data.type === "update_event") &&
    Object.keys(parsed.data.changes).length === 0
  )
    return null;
  return parsed.data;
}

const weekday = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat("es", { timeZone, weekday: "long" }).format(date);

type TurnDependencies = { gateway: AiGateway; context: AiContextRepository };
type TurnValue = { reply: string; actions: AssistantFlatAction[]; queries: AssistantQuery[] };

/**
 * Un mensaje del chat: como mucho dos llamadas al modelo. La primera puede pedir
 * datos; el servidor los consulta y la segunda responde con ellos. Nada se
 * guarda ni se aplica: los cambios vuelven como propuestas para confirmar.
 */
export async function runAssistantTurn(
  dependencies: TurnDependencies,
  userId: string,
  request: { message: string; history: AssistantMessage[] },
  now: Date = new Date(),
): Promise<AssistantTurnResponse | { kind: "consent_required" } | { kind: "invalid_input" }> {
  const timeZone = (await dependencies.context.assistantTimeZone(userId)) ?? FALLBACK_TIME_ZONE;
  const base = {
    message: request.message,
    history: request.history,
    now: `${localIso(now, timeZone)} (${weekday(now, timeZone)})`,
    timeZone,
  };
  let result = await dependencies.gateway.suggest(userId, "assistant_chat", {
    ...base,
    results: null,
  });
  let known: Known = new Map();
  if (result.kind === "suggestion") {
    const first = result.value as TurnValue;
    if (first.queries.length > 0) {
      const resolved = await resolveQueries(
        dependencies.context,
        userId,
        first.queries,
        timeZone,
        now,
      );
      known = resolved.known;
      result = await dependencies.gateway.suggest(userId, "assistant_chat", {
        ...base,
        results: resolved.results,
      });
    }
  }
  if (result.kind !== "suggestion") return result;
  const value = result.value as TurnValue;
  const actions = value.actions
    .map((flat) => toAssistantAction(flat, known, timeZone, now))
    .filter((action) => action !== null)
    .slice(0, 5);
  return {
    kind: "reply",
    source: "ai",
    requiresConfirmation: true,
    promptVersion: result.promptVersion,
    reply: value.reply,
    actions,
  };
}
