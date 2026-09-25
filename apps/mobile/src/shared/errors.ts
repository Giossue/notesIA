import { ZodError } from "zod";

/**
 * Texto apto para mostrar al usuario. Un ZodError trae en `message` el JSON de
 * todos sus problemas; se muestra solo el primero, que ya viene en español.
 */
export function userMessage(error: unknown) {
  if (error instanceof ZodError)
    return error.issues[0]?.message ?? "Revisa los datos del formulario.";
  if (error instanceof Error && error.message) return error.message;
  return "Algo salió mal. Inténtalo de nuevo.";
}
