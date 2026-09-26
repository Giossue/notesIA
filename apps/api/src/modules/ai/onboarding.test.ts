import { expect, test } from "bun:test";
import { draftReady, normalizeDraft } from "./onboarding";

test("normaliza horas, descarta tramos inválidos y fechas pasadas", () => {
  const draft = normalizeDraft(
    {
      studyHours: [
        { weekday: 1, start: "15:00", end: "19:00" },
        { weekday: 1, start: "15:00", end: "19:00" },
        { weekday: 2, start: "7:5", end: "09:00:00" },
        { weekday: 8, start: "10:00", end: "12:00" },
        { weekday: 3, start: "25:00", end: "12:00" },
      ],
      maxDailyMinutes: 5,
      commitments: [
        {
          title: " Cálculo ",
          kind: "class",
          weekdays: [3, 1, 1, 9],
          start: "7:00",
          end: "9:00",
          until: "2026-12-18",
        },
        {
          title: "Trabajo",
          kind: "job",
          weekdays: [6],
          start: "08:00",
          end: "12:00",
          until: "2020-01-01",
        },
        { title: "", kind: "other", weekdays: [1], start: "08:00", end: "09:00", until: null },
      ],
    },
    "2026-10-05",
  );
  expect(draft.studyHours).toEqual([
    { weekday: 1, start: "15:00", end: "19:00" },
    { weekday: 2, start: "07:05", end: "09:00" },
  ]);
  expect(draft.maxDailyMinutes).toBe(30);
  expect(draft.commitments).toEqual([
    {
      title: "Cálculo",
      kind: "class",
      weekdays: [1, 3],
      start: "07:00",
      end: "09:00",
      until: "2026-12-18",
    },
    { title: "Trabajo", kind: "other", weekdays: [6], start: "08:00", end: "12:00", until: null },
  ]);
  // Falta la fecha de fin del trabajo: todavía no se puede guardar.
  expect(draftReady(draft)).toBe(false);
});
