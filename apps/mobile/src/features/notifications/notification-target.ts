/** Lo que abre un aviso, igual desde la lista y desde el push. */
export type NotificationTarget =
  | { screen: "ActivityForm"; id: string; label: string }
  | { screen: "Reports"; label: string }
  | { screen: "Agenda"; label: string }
  | { screen: "Home"; label: string };

export function notificationTarget(notice: {
  type?: string | null;
  activityId?: string | null;
  planId?: string | null;
  reportId?: string | null;
}): NotificationTarget | null {
  if (notice.activityId)
    return { screen: "ActivityForm", id: notice.activityId, label: "Abrir tarea" };
  if (notice.reportId) return { screen: "Reports", label: "Ver mi reporte" };
  if (notice.planId) return { screen: "Agenda", label: "Abrir agenda" };
  if (notice.type === "streak_at_risk") return { screen: "Home", label: "Ir al inicio" };
  return null;
}
