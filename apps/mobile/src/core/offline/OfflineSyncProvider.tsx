import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { onlineManager, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { showToast } from "@/shared/Toast";
import { syncOutbox } from "./outbox";

/** Hay internet de verdad: conectado y, si el teléfono lo sabe, con acceso a internet. */
export const isOnline = (state: Pick<NetInfoState, "isConnected" | "isInternetReachable">) =>
  state.isConnected !== false && state.isInternetReachable !== false;

/**
 * Vigila la conexión: al perderla avisa que los cambios quedan en el teléfono;
 * al recuperarla avisa, envía los cambios pendientes y recarga los datos.
 */
export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const syncing = useRef(false);
  const online = useRef<boolean | null>(null);

  useEffect(() => {
    const sync = () => {
      if (syncing.current) return;
      syncing.current = true;
      void syncOutbox()
        .then((result) => {
          if (result.synced > 0) void queryClient.invalidateQueries();
        })
        .finally(() => {
          syncing.current = false;
        });
    };

    // React Query pausa las consultas sin conexión y las repite al volver.
    onlineManager.setEventListener((setOnline) =>
      NetInfo.addEventListener((state) => setOnline(isOnline(state))),
    );

    const unsubscribe = NetInfo.addEventListener((state) => {
      const now = isOnline(state);
      const before = online.current;
      online.current = now;
      if (before === null) {
        if (now) sync();
        return;
      }
      if (before && !now)
        showToast(
          "Sin conexión. Puedes seguir usando la app; tus cambios se enviarán después.",
          "info",
        );
      if (!before && now) {
        showToast("Conexión recuperada.", "info");
        sync();
        void queryClient.invalidateQueries();
      }
    });
    // Al volver a la app también se envía lo pendiente.
    const appState = AppState.addEventListener("change", (status) => {
      if (status === "active" && online.current) sync();
    });
    return () => {
      unsubscribe();
      appState.remove();
    };
  }, [queryClient]);
  return children;
}
