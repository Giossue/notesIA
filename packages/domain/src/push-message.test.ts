import { expect, test } from "bun:test";
import { pushMessage, whenText } from "./push-message";

const zone = "America/Guayaquil";
// Viernes 2 de octubre de 2026, 10:00 en Guayaquil (UTC-5).
const now = new Date("2026-10-02T15:00:00Z");

test("describe cuándo en la zona del estudiante", () => {
  expect(whenText(new Date("2026-10-02T20:30:00Z"), now, zone)).toBe("hoy a las 15:30");
  expect(whenText(new Date("2026-10-03T14:00:00Z"), now, zone)).toBe("mañana a las 09:00");
  expect(whenText(new Date("2026-10-06T23:00:00Z"), now, zone)).toMatch(
    /^el mar 6 oct a las 18:00$/,
  );
  // 23:30 local sigue siendo hoy aunque en UTC ya sea el día siguiente.
  expect(whenText(new Date("2026-10-03T04:30:00Z"), now, zone)).toBe("hoy a las 23:30");
});

test("cada tipo de aviso dice de qué se trata", () => {
  const base = { activityTitle: "Entrega de Cálculo", timeZone: zone, now };
  expect(
    pushMessage({
      ...base,
      type: "deadline_reminder",
      referenceAt: new Date("2026-10-02T20:30:00Z"),
    }),
  ).toEqual({ title: "Plazo próximo", body: "«Entrega de Cálculo» vence hoy a las 15:30" });
  expect(
    pushMessage({ ...base, type: "block_reminder", referenceAt: new Date("2026-10-03T14:00:00Z") }),
  ).toEqual({ title: "Hora de avanzar", body: "«Entrega de Cálculo» empieza mañana a las 09:00" });
  expect(pushMessage({ ...base, type: "risk_alert", referenceAt: null }).title).toBe(
    "Tarea en riesgo",
  );
  expect(
    pushMessage({ ...base, type: "plan_applied", activityTitle: null, referenceAt: null }),
  ).toEqual({ title: "Plan aplicado", body: "Tu plan de estudio ya está listo" });
});

test("recorta títulos largos y cubre tareas sin título", () => {
  const long = pushMessage({
    type: "risk_alert",
    activityTitle: "x".repeat(200),
    referenceAt: null,
    timeZone: zone,
    now,
  });
  expect(long.body.startsWith(`«${"x".repeat(59)}…»`)).toBe(true);
  expect(
    pushMessage({ type: "risk_alert", activityTitle: "  ", referenceAt: null, timeZone: zone, now })
      .body,
  ).toStartWith("«Tu tarea»");
});

test("un anuncio del panel usa su propio texto y un tipo desconocido no rompe el envío", () => {
  expect(
    pushMessage({
      type: "announcement",
      activityTitle: null,
      referenceAt: null,
      timeZone: zone,
      now,
      announcement: { title: "Mantenimiento", body: "Esta noche la app estará en pausa." },
    }),
  ).toEqual({ title: "Mantenimiento", body: "Esta noche la app estará en pausa." });
  expect(
    pushMessage({
      type: "algo_nuevo" as never,
      activityTitle: null,
      referenceAt: null,
      timeZone: zone,
      now,
    }),
  ).toEqual({ title: "NotesIA", body: "Tienes un aviso nuevo" });
});
