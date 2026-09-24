import { problemSchema, type Readiness, readinessSchema } from "@notesia/contracts";
import { apiBaseUrl } from "@/core/config/api";

export class ApiResponseError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ApiResponseError";
  }
}

export async function getReadiness(
  baseUrl = apiBaseUrl,
  fetcher: typeof fetch = fetch,
): Promise<Readiness> {
  if (!baseUrl) {
    throw new ApiResponseError("Falta configurar la dirección de la API.", "API_NOT_CONFIGURED");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetcher(`${baseUrl.replace(/\/$/, "")}/ready`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ApiResponseError(
        "El servidor devolvió una respuesta inesperada.",
        "INVALID_RESPONSE",
      );
    }

    if (!response.ok) {
      const problem = problemSchema.safeParse(body);
      throw new ApiResponseError(
        problem.success ? problem.data.title : "El servidor no está disponible.",
        problem.success ? problem.data.code : "API_ERROR",
      );
    }

    const result = readinessSchema.safeParse(body);
    if (!result.success) {
      throw new ApiResponseError(
        "El servidor devolvió una respuesta inesperada.",
        "INVALID_RESPONSE",
      );
    }
    return result.data;
  } catch (error) {
    if (error instanceof ApiResponseError) {
      throw error;
    }
    if (controller.signal.aborted) {
      throw new ApiResponseError("La conexión tardó demasiado.", "API_TIMEOUT");
    }
    throw new ApiResponseError("No se pudo contactar al servidor local.", "NETWORK_ERROR");
  } finally {
    clearTimeout(timeout);
  }
}
