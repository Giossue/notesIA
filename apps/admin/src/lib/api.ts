import { problemSchema } from "@notesia/contracts";
import type { z } from "zod";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;

  constructor(options: {
    status: number;
    code: string;
    title: string;
    detail?: string;
    requestId?: string;
    retryAfterSeconds?: number;
  }) {
    super(options.detail ?? options.title);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

type RequestOptions = Omit<RequestInit, "body"> & { body?: unknown };

export async function apiRequest<T>(
  path: `/v1/${string}`,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    ...options,
    credentials: "include",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const problem = problemSchema.safeParse(payload);
    const retryAfter = Number(response.headers.get("Retry-After"));
    throw new ApiError({
      status: response.status,
      code: problem.success ? problem.data.code : "REQUEST_FAILED",
      title: problem.success ? problem.data.title : "No se pudo completar la solicitud.",
      detail: problem.success ? problem.data.detail : undefined,
      requestId: problem.success ? problem.data.requestId : undefined,
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    });
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success)
    throw new ApiError({
      status: 502,
      code: "INVALID_API_RESPONSE",
      title: "La API devolvió una respuesta incompatible.",
    });
  return parsed.data;
}

export function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "Ocurrió un error inesperado.";
}
