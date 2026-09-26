import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect } from "react";
import { navigateWhenReady, navigationRef } from "@/navigation/navigation-ref";
import { showToast } from "@/shared/Toast";
import { type PushEvent, subscribeToPushEvents } from "./push-registration";

/** Abre lo que avisa: la actividad, la agenda (planes), la racha o, si no, la lista de avisos. */
function openPushEvent(event: PushEvent) {
  navigateWhenReady(() => {
    if (event.activityId) navigationRef.navigate("ActivityForm", { id: event.activityId });
    else if (event.planId) navigationRef.navigate("Agenda");
    else if (event.type === "streak_at_risk") navigationRef.navigate("Progress");
    else if (event.reportId) navigationRef.navigate("Reports");
    else navigationRef.navigate("Notifications");
  });
}

export function PushRegistrationProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    void subscribeToPushEvents({
      onMessage: (event) => {
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
        // Con la app abierta Android no lo muestra: se avisa dentro de la app.
        if (event.title)
          showToast(event.body ? `${event.title}: ${event.body}` : event.title, "info");
      },
      onOpen: (event) => {
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
        openPushEvent(event);
      },
    })
      .then((listener) => {
        if (active) unsubscribe = listener;
        else listener();
      })
      .catch(() => {});
    return () => {
      active = false;
      unsubscribe();
    };
  }, [queryClient]);
  return children;
}
