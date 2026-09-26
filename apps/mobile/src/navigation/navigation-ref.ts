import { createNavigationContainerRef } from "@react-navigation/native";
import type { RootStackParamList } from "./types";

/** Para navegar desde fuera de las pantallas, como al tocar un aviso push. */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

let pending: (() => void) | null = null;

/** Navega ya o, si la app aún está arrancando, en cuanto la navegación esté lista. */
export function navigateWhenReady(go: () => void) {
  if (navigationRef.isReady()) go();
  else pending = go;
}

export function flushPendingNavigation() {
  const go = pending;
  pending = null;
  go?.();
}
