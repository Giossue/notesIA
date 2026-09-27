import { expect, test } from "bun:test";
import { ApiError } from "@/core/api/api-error";
import { userMessage } from "./errors";

test("los errores de la API se muestran en lenguaje claro", () => {
  expect(userMessage(new ApiError("La tarea cambió. Actualízala.", "VERSION_CONFLICT", 409))).toBe(
    "Esto cambió hace un momento. Vuelve a abrirlo e inténtalo de nuevo.",
  );
  expect(userMessage(new ApiError("Tarea no encontrada.", "ACTIVITY_NOT_FOUND", 404))).toBe(
    "Ya no existe. Puede que se haya borrado.",
  );
  expect(userMessage(new ApiError("Versión inválida.", "VALIDATION_FAILED", 422))).toBe(
    "Revisa los datos e inténtalo de nuevo.",
  );
  // Los mensajes que ya son claros se respetan.
  expect(
    userMessage(new ApiError("El rango debe ser de hasta 31 días.", "VALIDATION_FAILED", 422)),
  ).toBe("El rango debe ser de hasta 31 días.");
  expect(userMessage(new ApiError("boom", "API_ERROR", 500))).toBe(
    "Algo salió mal. Inténtalo de nuevo en un momento.",
  );
});
