import type { HeaderInfo } from "./ScreenHeader";

/** Qué es cada cosa, en una frase, para la «i» de los encabezados. */
export const taskInfo: HeaderInfo = {
  title: "¿Qué es una tarea?",
  text: "Algo que tienes que hacer y tiene entrega: un trabajo, un examen, algo personal o una rutina. Le pones fecha y tiempo estimado, y la app reparte sesiones de estudio en tu horario para que llegues a tiempo.",
};

export const busyTimeInfo: HeaderInfo = {
  title: "¿Qué es una hora ocupada?",
  text: "Una hora en la que no puedes estudiar, por ejemplo durante una clase o tu trabajo. La app evita poner sesiones de estudio en ese intervalo.",
};

export const studyHoursInfo: HeaderInfo = {
  title: "¿Cómo funciona tu horario?",
  text: "Marca las franjas en que aceptarías estudiar y las horas en que estás ocupado. La app propone sesiones solo en el tiempo que queda libre. El máximo diario limita cuánto estudio te propone.",
};

export const streakInfo: HeaderInfo = {
  title: "¿Qué es la racha?",
  text: "Suma un día cuando completas una tarea. Si no tienes ninguna tarea disponible, la racha se pausa: no suma ni se pierde. Si tienes tareas disponibles y no completas ninguna, vuelve a empezar. Hoy no cuenta como perdido hasta que termine el día.",
};

export const agendaInfo: HeaderInfo = {
  title: "¿Qué ves en la agenda?",
  text: "Tu día a día en un solo lugar: horas ocupadas, entregas de tareas y sesiones de estudio. Elige un día arriba o toca el mes y año para saltar a otra fecha. Puedes editar las horas ocupadas desde Horario.",
};
