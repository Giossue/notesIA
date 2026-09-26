import { useFocusEffect } from "@react-navigation/native";
import { type RefObject, useCallback, useEffect, useRef } from "react";
import { BackHandler, Platform, ToastAndroid } from "react-native";

const WINDOW_MS = 2000;

/**
 * El primer "atrás" solo avisa con un toast nativo; el segundo, dentro de 2 s,
 * cierra la app. Así no se sale por accidente.
 */
function listenDoubleBack(lastPress: RefObject<number>) {
  if (Platform.OS !== "android") return;
  const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
    const now = Date.now();
    if (now - lastPress.current < WINDOW_MS) return false; // deja salir
    lastPress.current = now;
    ToastAndroid.show("Presiona atrás otra vez para salir", ToastAndroid.SHORT);
    return true;
  });
  return () => subscription.remove();
}

/** Para la pantalla raíz de la navegación: solo actúa mientras tiene el foco. */
export function useExitOnDoubleBack() {
  const lastPress = useRef(0);
  useFocusEffect(useCallback(() => listenDoubleBack(lastPress), []));
}

/** Para pantallas fuera de la navegación (entrada y consentimiento): actúa mientras está montado. */
export function ExitOnDoubleBack() {
  const lastPress = useRef(0);
  useEffect(() => listenDoubleBack(lastPress), []);
  return null;
}
