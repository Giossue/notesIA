import type { AssistantAction } from "@notesia/contracts";
import { v4 as uuidv4 } from "uuid";
import {
  createActivity,
  deleteActivity,
  getActivity,
  transitionActivity,
  updateActivity,
  updateActivityProgress,
} from "@/core/api/activities";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvent,
  updateCalendarEvent,
} from "@/core/api/calendar-events";
import { createSubtask } from "@/core/api/subtasks";
import { kindLabel } from "@/shared/activity-kinds";

/**
 * Aplica una propuesta confirmada con las mismas rutas de la app: así valen las
 * validaciones, la versión vigente y la cola sin conexión de siempre.
 */
export async function applyAssistantAction(action: AssistantAction) {
  switch (action.type) {
    case "create_activity":
      return createActivity({ id: uuidv4(), ...action.activity });
    case "update_activity": {
      const current = await getActivity(action.activityId);
      return updateActivity(action.activityId, {
        kind: current.kind,
        title: current.title,
        description: current.description,
        priority: current.priority,
        startAfterAt: current.startAfterAt,
        deadlineAt: current.deadlineAt,
        estimatedMinutes: current.estimatedMinutes,
        ...action.changes,
        version: current.version,
      });
    }
    case "set_activity_progress": {
      const current = await getActivity(action.activityId);
      return updateActivityProgress(
        action.activityId,
        current.version,
        uuidv4(),
        action.progressPercent,
      );
    }
    case "transition_activity": {
      const current = await getActivity(action.activityId);
      return transitionActivity(action.activityId, current.version, uuidv4(), action.transition);
    }
    case "delete_activity": {
      const current = await getActivity(action.activityId);
      return deleteActivity(action.activityId, current.version, uuidv4());
    }
    case "create_subtasks":
      for (const subtask of action.subtasks)
        await createSubtask(action.activityId, { id: uuidv4(), ...subtask });
      return;
    case "create_event":
      return createCalendarEvent({ id: uuidv4(), ...action.event });
    case "update_event": {
      const current = await getCalendarEvent(action.eventId);
      return updateCalendarEvent(action.eventId, {
        kind: current.kind,
        title: current.title,
        description: current.description,
        startsAt: current.startsAt,
        endsAt: current.endsAt,
        timeZone: current.timeZone,
        ...action.changes,
        version: current.version,
        mutationId: uuidv4(),
      });
    }
    case "archive_event": {
      const current = await getCalendarEvent(action.eventId);
      return deleteCalendarEvent(action.eventId, current.version, uuidv4());
    }
    case "plan_week":
      // Se aplica desde su propia tarjeta, con la vista previa del planificador.
      return;
  }
}

const priorityLabels = { low: "baja", medium: "media", high: "alta", critical: "crítica" };
const eventKindLabels = {
  class: "Clase",
  work: "Trabajo",
  appointment: "Cita",
  personal: "Personal",
  unavailable: "No disponible",
  other: "Evento",
};
const transitionLabels = {
  complete: "Marcar como completada",
  reopen: "Reabrir",
  cancel: "Cancelar",
  start: "Empezar",
  pause: "Pausar",
};

/** "vie 9 oct, 10:00" en la hora del teléfono. */
export function when(iso: string) {
  return new Date(iso).toLocaleString("es", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Título y detalles de la tarjeta de una propuesta, para revisarla antes de confirmar. */
export function describeAction(action: AssistantAction): {
  icon: string;
  heading: string;
  title: string;
  details: string[];
} {
  switch (action.type) {
    case "create_activity": {
      const { activity } = action;
      return {
        icon: "plus",
        heading: "Crear actividad",
        title: activity.title,
        details: [
          `${kindLabel(activity.kind)} · prioridad ${priorityLabels[activity.priority]}`,
          ...(activity.deadlineAt ? [`Entrega: ${when(activity.deadlineAt)}`] : []),
          ...(activity.estimatedMinutes
            ? [`Tiempo estimado: ${activity.estimatedMinutes} min`]
            : []),
        ],
      };
    }
    case "update_activity": {
      const { changes } = action;
      return {
        icon: "pencil-outline",
        heading: "Editar actividad",
        title: action.title,
        details: [
          ...(changes.title ? [`Nuevo nombre: ${changes.title}`] : []),
          ...(changes.priority ? [`Prioridad ${priorityLabels[changes.priority]}`] : []),
          ...(changes.deadlineAt ? [`Entrega: ${when(changes.deadlineAt)}`] : []),
          ...(changes.startAfterAt ? [`Empezar desde: ${when(changes.startAfterAt)}`] : []),
          ...(changes.estimatedMinutes ? [`Tiempo estimado: ${changes.estimatedMinutes} min`] : []),
          ...(changes.kind ? [`Tipo: ${kindLabel(changes.kind)}`] : []),
          ...(changes.description !== undefined ? ["Actualizar descripción"] : []),
        ],
      };
    }
    case "set_activity_progress":
      return {
        icon: "chart-bar",
        heading: "Actualizar progreso",
        title: action.title,
        details: [`Avance: ${action.progressPercent}%`],
      };
    case "transition_activity":
      return {
        icon: action.transition === "complete" ? "check" : "refresh",
        heading: transitionLabels[action.transition],
        title: action.title,
        details: [],
      };
    case "delete_activity":
      return {
        icon: "delete-outline",
        heading: "Eliminar actividad",
        title: action.title,
        details: [],
      };
    case "create_subtasks":
      return {
        icon: "plus",
        heading: "Agregar subtareas",
        title: action.title,
        details: action.subtasks.map((subtask) => `• ${subtask.title}`),
      };
    case "create_event":
      return {
        icon: "calendar-plus",
        heading: "Crear evento",
        title: action.event.title,
        details: [
          eventKindLabels[action.event.kind],
          `${when(action.event.startsAt)} – ${new Date(action.event.endsAt).toLocaleTimeString(
            "es",
            { hour: "2-digit", minute: "2-digit" },
          )}`,
        ],
      };
    case "update_event": {
      const { changes } = action;
      return {
        icon: "pencil-outline",
        heading: "Editar evento",
        title: action.title,
        details: [
          ...(changes.title ? [`Nuevo nombre: ${changes.title}`] : []),
          ...(changes.startsAt ? [`Empieza: ${when(changes.startsAt)}`] : []),
          ...(changes.endsAt ? [`Termina: ${when(changes.endsAt)}`] : []),
          ...(changes.kind ? [eventKindLabels[changes.kind]] : []),
        ],
      };
    }
    case "archive_event":
      return {
        icon: "delete-outline",
        heading: "Eliminar evento",
        title: action.title,
        details: [],
      };
    case "plan_week":
      return {
        icon: "calendar-clock",
        heading: "Planificar mi semana",
        title: action.title,
        details: [],
      };
  }
}
