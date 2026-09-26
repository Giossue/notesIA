import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from "react-native";

type NativeSpeechModule = {
  isAvailable(): Promise<boolean>;
  start(locale: string): Promise<string>;
  stop(): Promise<void>;
  cancel(): Promise<void>;
};

type NativeSpeechError = Error & { code?: string };

const MAX_DICTATION_MILLISECONDS = 20_000;

function getNativeSpeech(): NativeSpeechModule {
  const nativeSpeech = NativeModules.NotesIASpeech as NativeSpeechModule | undefined;
  if (!nativeSpeech) {
    throw new SpeechRecognitionError(
      "NOT_AVAILABLE",
      "El dictado requiere volver a instalar la versión nativa de NotesIA.",
    );
  }
  return nativeSpeech;
}

export class SpeechRecognitionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SpeechRecognitionError";
  }
}

function userMessageForNativeError(error: unknown) {
  const code = (error as NativeSpeechError | undefined)?.code ?? "RECOGNITION_FAILED";
  const messages: Record<string, string> = {
    BUSY: "Ya hay un dictado en curso.",
    CANCELLED: "Se canceló el dictado.",
    NETWORK: "El servicio de voz necesita conexión.",
    LANGUAGE_UNAVAILABLE: "El idioma de dictado no está disponible en el dispositivo.",
    NO_MATCH: "No se reconoció ninguna frase. Inténtalo de nuevo o escribe el texto.",
    NOT_AVAILABLE: "Este dispositivo no tiene un servicio de reconocimiento de voz disponible.",
    PERMISSION_DENIED: "Activa el permiso de micrófono para usar el dictado.",
    START_FAILED: "No se pudo iniciar el micrófono.",
    TIMEOUT: "No se detectó voz a tiempo.",
  };
  return new SpeechRecognitionError(
    code,
    messages[code] ?? "No se pudo convertir la voz en texto.",
  );
}

async function requestMicrophonePermission() {
  if (Platform.OS !== "android") return;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
    title: "Permiso para dictar",
    message: "NotesIA necesita el micrófono únicamente mientras dictas una actividad.",
    buttonPositive: "Permitir",
    buttonNegative: "Cancelar",
  });
  if (result !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new SpeechRecognitionError(
      "PERMISSION_DENIED",
      "Activa el permiso de micrófono para usar el dictado.",
    );
  }
}

/**
 * Escucha una frase y devuelve el texto final. `onPartial` recibe lo reconocido
 * hasta el momento, para ir mostrándolo mientras la persona habla.
 */
export async function recognizeSpeech(locale: string, onPartial?: (text: string) => void) {
  const nativeSpeech = getNativeSpeech();
  await requestMicrophonePermission();
  if (!(await nativeSpeech.isAvailable())) {
    throw new SpeechRecognitionError(
      "NOT_AVAILABLE",
      "Este dispositivo no tiene un servicio de reconocimiento de voz disponible.",
    );
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const partials = onPartial
    ? new NativeEventEmitter(NativeModules.NotesIASpeech).addListener(
        "NotesIASpeechPartial",
        (text: unknown) => {
          if (typeof text === "string") onPartial(text.trim().replace(/\s+/g, " "));
        },
      )
    : null;
  try {
    const transcript = await Promise.race([
      nativeSpeech.start(locale),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          void nativeSpeech.cancel().catch(() => undefined);
          reject(new SpeechRecognitionError("TIMEOUT", "No se detectó voz a tiempo."));
        }, MAX_DICTATION_MILLISECONDS);
      }),
    ]);
    const normalized = transcript.trim().replace(/\s+/g, " ");
    if (!normalized) throw new SpeechRecognitionError("NO_MATCH", "No se reconoció ninguna frase.");
    return normalized;
  } catch (error) {
    if (error instanceof SpeechRecognitionError) throw error;
    throw userMessageForNativeError(error);
  } finally {
    if (timeout) clearTimeout(timeout);
    partials?.remove();
  }
}

export async function stopSpeechRecognition() {
  await getNativeSpeech().stop();
}

export async function cancelSpeechRecognition() {
  const nativeSpeech = NativeModules.NotesIASpeech as NativeSpeechModule | undefined;
  if (nativeSpeech) await nativeSpeech.cancel();
}
