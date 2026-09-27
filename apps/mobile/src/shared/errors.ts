import { ZodError } from "zod";
import { ApiError } from "@/core/api/api-error";

/** Mensajes técnicos del servidor que no le dicen nada al estudiante. */
const TECHNICAL = /inválid|JSON|cursor|identificador|horizonte|versión|origen|solicitud/i;

/**
 * Texto claro y directo para mostrar al usuario. Los errores de la API se
 * traducen por su código; un ZodError muestra solo su primer problema.
 */
export function userMessage(error: unknown) {
  if (error instanceof ZodError)
    return error.issues[0]?.message ?? "Revisa los datos e inténtalo de nuevo.";
  if (error instanceof ApiError) {
    const { code, status, message } = error;
    if (code === "VERSION_CONFLICT" || (code.endsWith("_CONFLICT") && code !== "SCHEDULE_CONFLICT"))
      return "Esto cambió hace un momento. Vuelve a abrirlo e inténtalo de nuevo.";
    if (code === "NOT_FOUND" || code.endsWith("_NOT_FOUND"))
      return "Ya no existe. Puede que se haya borrado.";
    if (code === "AUTH_REQUIRED") return "Tu sesión terminó. Vuelve a iniciar sesión.";
    if (code === "RATE_LIMITED") return "Vas muy rápido. Espera un momento e inténtalo de nuevo.";
    if (code === "FORBIDDEN") return "No tienes permiso para hacer esto.";
    if ((status ?? 0) >= 500) return "Algo salió mal. Inténtalo de nuevo en un momento.";
    if (code === "VALIDATION_FAILED" && TECHNICAL.test(message))
      return "Revisa los datos e inténtalo de nuevo.";
    return message;
  }
  if (
    error instanceof Error &&
    error.message &&
    !/network|fetch|timeout|abort/i.test(error.message)
  )
    return error.message;
  return "Algo salió mal. Inténtalo de nuevo.";
}
