import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useRef } from "react";
import { BackHandler, Platform, ToastAndroid } from "react-native";

const WINDOW_MS = 2000;

/**
 * En la pantalla raíz, el primer "atrás" solo avisa con un toast nativo; el
 * segundo, dentro de 2 s, cierra la app. Así no se sale por accidente.
 */
export function useExitOnDoubleBack() {
  const lastPress = useRef(0);
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android") return;
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        const now = Date.now();
        if (now - lastPress.current < WINDOW_MS) return false; // deja salir
        lastPress.current = now;
        ToastAndroid.show("Presiona atrás otra vez para salir", ToastAndroid.SHORT);
        return true;
      });
      return () => subscription.remove();
    }, []),
  );
}
