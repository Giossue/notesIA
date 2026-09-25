import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect } from "react";
import { subscribeToPushEvents } from "./push-registration";

export function PushRegistrationProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    void subscribeToPushEvents(() => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
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
