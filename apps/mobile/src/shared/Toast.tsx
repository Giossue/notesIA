import { type ReactNode, useEffect, useState } from "react";
import { Portal, Snackbar, useTheme } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { layout } from "@/core/theme/layout";

type ToastKind = "error" | "info";
type Toast = { id: number; message: string; kind: ToastKind };

// Almacén a nivel de módulo: así el `onError` global de las mutaciones, que vive
// fuera del árbol de React, puede mostrar avisos.
let listener: ((toast: Toast) => void) | null = null;
let nextId = 1;

export function showToast(message: string, kind: ToastKind = "error") {
  listener?.({ id: nextId++, message, kind });
}

export function useToast() {
  return { show: showToast };
}

/** Aviso breve arriba de la pantalla; uno nuevo reemplaza al anterior. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    listener = setToast;
    return () => {
      if (listener === setToast) listener = null;
    };
  }, []);

  const isError = toast?.kind === "error";
  const foreground = isError ? theme.colors.onError : theme.colors.inverseOnSurface;

  return (
    <>
      {children}
      <Portal>
        <Snackbar
          key={toast?.id}
          visible={!!toast}
          onDismiss={() => setToast(null)}
          duration={4000}
          wrapperStyle={{ top: insets.top + 8, bottom: undefined }}
          style={{
            borderRadius: layout.cardRadius,
            backgroundColor: isError ? theme.colors.error : theme.colors.inverseSurface,
          }}
          theme={{ colors: { inverseOnSurface: foreground } }}
          action={{
            label: "Cerrar",
            textColor: foreground,
            onPress: () => setToast(null),
          }}
          accessibilityLiveRegion="polite"
        >
          {toast?.message}
        </Snackbar>
      </Portal>
    </>
  );
}
