import { NativeModules } from "react-native";

type NativeTts = {
  isAvailable(): Promise<boolean>;
  speak(text: string): Promise<void>;
  stop(): Promise<void>;
};

const nativeTts = () => NativeModules.NotesIATts as NativeTts | undefined;

/** Lee un texto en voz alta; si el teléfono no tiene voz, no hace nada. */
export function speak(text: string) {
  void nativeTts()
    ?.speak(text)
    .catch(() => undefined);
}

export function stopSpeaking() {
  void nativeTts()
    ?.stop()
    .catch(() => undefined);
}
