import { useEffect } from "react";
import { NativeModules } from "react-native";

/** Quita la pantalla de arranque de Android (MainActivity la mantiene hasta aquí). */
export function hideSplash() {
  NativeModules.NotesIASplash?.hide?.();
}

/** Para la primera pantalla real: al montarse, se va la pantalla de arranque. */
export function useHideSplash() {
  useEffect(hideSplash, []);
}
