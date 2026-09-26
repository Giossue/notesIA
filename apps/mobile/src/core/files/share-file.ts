import { NativeModules } from "react-native";

type NativeFiles = {
  share(base64: string, fileName: string, mimeType: string, title: string): Promise<void>;
};

/** Guarda el archivo en la app y abre el menú de Android para guardarlo o compartirlo. */
export async function shareFile(base64: string, fileName: string, mimeType: string, title: string) {
  const files = NativeModules.NotesIAFiles as NativeFiles | undefined;
  if (!files) throw new Error("Actualiza la app para poder exportar archivos.");
  await files.share(base64, fileName, mimeType, title);
}
