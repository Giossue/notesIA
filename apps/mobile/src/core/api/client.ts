import { problemSchema } from "@notesia/contracts";
import type { z } from "zod";
import { getSessionCookie } from "@/core/auth/session-storage";
import { apiBaseUrl } from "@/core/config/api";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function requestJson<T extends z.ZodType>(
  path: string,
  schema: T,
  options: { method?: "GET" | "PATCH" | "POST"; body?: unknown } = {},
): Promise<z.output<T>> {
  const cookie = await getSessionCookie();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ApiError("El servidor devolvió una respuesta inesperada.", "INVALID_RESPONSE");
    }
    if (!response.ok) {
      const parsed = problemSchema.safeParse(body);
      throw new ApiError(
        parsed.success ? parsed.data.title : "No se pudo completar la solicitud.",
        parsed.success ? parsed.data.code : "API_ERROR",
        response.status,
      );
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      throw new ApiError("El servidor devolvió datos inesperados.", "INVALID_RESPONSE");
    return parsed.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted)
      throw new ApiError("La conexión tardó demasiado.", "API_TIMEOUT");
    throw new ApiError("No se pudo contactar al servidor local.", "NETWORK_ERROR");
  } finally {
    clearTimeout(timeout);
  }
}
