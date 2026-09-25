import NetInfo from "@react-native-community/netinfo";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef } from "react";
import { syncOutbox } from "./outbox";

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const syncing = useRef(false);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (!state.isConnected || syncing.current) return;
      syncing.current = true;
      void syncOutbox()
        .then((result) => {
          if (result.synced > 0) void queryClient.invalidateQueries();
        })
        .finally(() => {
          syncing.current = false;
        });
    });
    return unsubscribe;
  }, [queryClient]);
  return children;
}
