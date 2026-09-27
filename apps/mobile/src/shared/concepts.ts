import type { HeaderInfo } from "./ScreenHeader";

/** Qué es cada cosa, en una frase, para la «i» de los encabezados. */
export const taskInfo: HeaderInfo = {
  title: "¿Qué es una tarea?",
  text: "Algo que tienes que hacer y tiene entrega: un trabajo, un examen, algo personal o una rutina. Le pones fecha y tiempo estimado, y la app reparte sesiones de estudio en tu horario para que llegues a tiempo.",
};

export const commitmentInfo: HeaderInfo = {
  title: "¿Qué es un compromiso?",
  text: "Un momento en que ya estás ocupado: una clase, tu trabajo o una cita. Tiene hora de inicio y de fin, y la app no te pone a estudiar en esas horas.",
};

export const studyHoursInfo: HeaderInfo = {
  title: "¿Qué es tu horario de estudio?",
  text: "Las horas libres de cada día en que puedes estudiar. La app solo pone sesiones de estudio dentro de ese horario y nunca encima de tus compromisos. El máximo al día limita cuánto estudio te propone por día.",
};

export const streakInfo: HeaderInfo = {
  title: "¿Qué es la racha?",
  text: "Los días seguidos en que completaste al menos una tarea. Si pasa un día sin completar ninguna, vuelve a empezar. Hoy no cuenta como perdido hasta que termine el día.",
};
