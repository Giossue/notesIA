export type PushNotificationType =
  | "plan_applied"
  | "deadline_reminder"
  | "block_reminder"
  | "risk_alert"
  | "streak_at_risk"
  | "report_updated";

export type PushMessageInput = {
  type: PushNotificationType;
  /** Título de la actividad, si el aviso es de una. */
  activityTitle: string | null;
  /** Vencimiento (plazo) o inicio (bloque) al que se refiere el aviso. */
  referenceAt: Date | null;
  timeZone: string;
  now: Date;
};

const MAX_TITLE = 60;

function quote(title: string | null) {
  const clean = (title ?? "").replace(/\s+/g, " ").trim() || "Tu tarea";
  return `«${clean.length > MAX_TITLE ? `${clean.slice(0, MAX_TITLE - 1)}…` : clean}»`;
}

function localDay(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, dateStyle: "short" }).format(date);
}

/** "hoy a las 15:00", "mañana a las 09:30" o "el vie 3 oct a las 18:00". */
export function whenText(at: Date, now: Date, timeZone: string) {
  const time = new Intl.DateTimeFormat("es", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
  const day = localDay(at, timeZone);
  if (day === localDay(now, timeZone)) return `hoy a las ${time}`;
  if (day === localDay(new Date(now.getTime() + 86_400_000), timeZone))
    return `mañana a las ${time}`;
  const date = new Intl.DateTimeFormat("es", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  })
    .format(at)
    .replaceAll(".", "")
    .replace(",", "");
  return `el ${date} a las ${time}`;
}

/** Título y texto del aviso push; el mismo que ve el estudiante en la lista. */
export function pushMessage(input: PushMessageInput): { title: string; body: string } {
  const activity = quote(input.activityTitle);
  const when = input.referenceAt ? whenText(input.referenceAt, input.now, input.timeZone) : null;
  switch (input.type) {
    case "deadline_reminder":
      return {
        title: "Plazo próximo",
        body: when ? `${activity} vence ${when}` : `${activity} vence pronto`,
      };
    case "block_reminder":
      return {
        title: "Hora de avanzar",
        body: when ? `${activity} empieza ${when}` : `${activity} empieza pronto`,
      };
    case "risk_alert":
      return {
        title: "Tarea en riesgo",
        body: `${activity} podría no terminarse a tiempo. Revisa tu plan`,
      };
    case "streak_at_risk":
      return {
        title: "🔥 Tu racha está en peligro",
        body: "Completa una tarea hoy para no perderla",
      };
    case "report_updated":
      return {
        title: "Soporte revisó tu reporte",
        body: `${activity}: toca para ver la respuesta`,
      };
    case "plan_applied":
      return { title: "Plan aplicado", body: "Tu plan de estudio ya está listo" };
  }
}
