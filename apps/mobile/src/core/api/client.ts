import { problemSchema } from "@notesia/contracts";
import NetInfo from "@react-native-community/netinfo";
import type { z } from "zod";
import { getSessionCookie } from "@/core/auth/session-storage";
import { getApiBaseUrl } from "@/core/config/api";
import { readApiCache, writeApiCache } from "@/core/offline/cache";
import { enqueueMutation, type QueueMetadata } from "@/core/offline/outbox";
import { ApiError } from "./api-error";

export { ApiError } from "./api-error";

export class OfflineQueuedError extends ApiError {
  constructor() {
    super(
      "Sin internet: lo guardamos en tu teléfono y se enviará cuando vuelva la conexión.",
      "OFFLINE_QUEUED",
    );
    this.name = "OfflineQueuedError";
  }
}

async function cachedJson<T extends z.ZodType>(path: string, schema: T) {
  const cached = await readApiCache(path).catch(() => null);
  if (!cached) return null;
  const parsedJson = (() => {
    try {
      return JSON.parse(cached) as unknown;
    } catch {
      return null;
    }
  })();
  const parsed = schema.safeParse(parsedJson);
  return parsed.success ? parsed.data : null;
}

async function queueRequest(
  queue: QueueMetadata,
  request: {
    method: "DELETE" | "PATCH" | "POST" | "PUT";
    path: string;
    body?: unknown;
    idempotencyKey?: string;
  },
): Promise<never> {
  try {
    await enqueueMutation(queue, request);
  } catch (error) {
    throw new ApiError(
      error instanceof Error ? error.message : "No se pudo guardar el cambio sin conexión.",
      "OFFLINE_QUEUE_ERROR",
    );
  }
  throw new OfflineQueuedError();
}

export async function requestJson<T extends z.ZodType>(
  path: string,
  schema: T,
  options: {
    method?: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
    body?: unknown;
    idempotencyKey?: string;
    queue?: QueueMetadata;
    timeoutMs?: number;
  } = {},
): Promise<z.output<T>> {
  const method = options.method ?? "GET";
  const network = await NetInfo.fetch().catch(() => null);
  if (network?.isConnected === false) {
    if (method === "GET") {
      const cached = await cachedJson(path, schema);
      if (cached !== null) return cached;
      throw new ApiError("No hay datos guardados para esta pantalla.", "OFFLINE_CACHE_MISS");
    }
    if (options.queue)
      return queueRequest(options.queue, {
        method: method as "DELETE" | "PATCH" | "POST" | "PUT",
        path,
        body: options.body,
        idempotencyKey: options.idempotencyKey,
      });
    throw new ApiError("Esta acción requiere conexión.", "NETWORK_REQUIRED");
  }
  const cookie = await getSessionCookie();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    let body: unknown = null;
    if (response.status !== 204)
      try {
        body = await response.json();
      } catch {
        throw new ApiError("Algo salió mal. Inténtalo de nuevo en un momento.", "INVALID_RESPONSE");
      }
    if (!response.ok) {
      const parsed = problemSchema.safeParse(body);
      throw new ApiError(
        parsed.success ? parsed.data.title : "Algo salió mal. Inténtalo de nuevo en un momento.",
        parsed.success ? parsed.data.code : "API_ERROR",
        response.status,
      );
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      throw new ApiError("Algo salió mal. Inténtalo de nuevo en un momento.", "INVALID_RESPONSE");
    if (method === "GET") await writeApiCache(path, parsed.data).catch(() => {});
    return parsed.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (method === "GET") {
      const cached = await cachedJson(path, schema);
      if (cached !== null) return cached;
    }
    if (options.queue)
      return queueRequest(options.queue, {
        method: method as "DELETE" | "PATCH" | "POST" | "PUT",
        path,
        body: options.body,
        idempotencyKey: options.idempotencyKey,
      });
    if (controller.signal.aborted)
      throw new ApiError("El servidor tardó en responder. Inténtalo de nuevo.", "API_TIMEOUT");
    throw new ApiError(
      "No hay conexión. Revisa tu internet e inténtalo de nuevo.",
      "NETWORK_ERROR",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestText(
  path: string,
  options: { method?: "GET" | "POST"; body?: unknown; timeoutMs?: number } = {},
): Promise<string> {
  const cookie = await getSessionCookie();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response
        .clone()
        .json()
        .catch(() => null);
      const parsed = problemSchema.safeParse(body);
      throw new ApiError(
        parsed.success ? parsed.data.title : "Algo salió mal. Inténtalo de nuevo en un momento.",
        parsed.success ? parsed.data.code : "API_ERROR",
        response.status,
      );
    }
    return response.text();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted)
      throw new ApiError("El servidor tardó en responder. Inténtalo de nuevo.", "API_TIMEOUT");
    throw new ApiError(
      "No hay conexión. Revisa tu internet e inténtalo de nuevo.",
      "NETWORK_ERROR",
    );
  } finally {
    clearTimeout(timeout);
  }
}
