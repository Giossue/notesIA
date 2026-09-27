import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect } from "react";
import { markNotificationReadById } from "@/core/api/notifications";
import { notificationTarget } from "@/features/notifications/notification-target";
import { navigateWhenReady, navigationRef } from "@/navigation/navigation-ref";
import { showToast } from "@/shared/Toast";
import { type PushEvent, subscribeToPushEvents } from "./push-registration";

/** Abre lo que avisa; si no apunta a nada concreto, la lista de avisos. */
function openPushEvent(event: PushEvent) {
  const target = notificationTarget(event);
  navigateWhenReady(() => {
    if (target?.screen === "ActivityForm")
      navigationRef.navigate("ActivityForm", { id: target.id });
    else if (target) navigationRef.navigate(target.screen);
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
        openPushEvent(event);
        // Tocarlo ya es leerlo.
        const read = event.notificationId
          ? markNotificationReadById(event.notificationId).catch(() => {})
          : Promise.resolve();
        void read.then(() => queryClient.invalidateQueries({ queryKey: ["notifications"] }));
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
