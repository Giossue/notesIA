import { afterEach, expect, test, vi } from "vitest";
import { z } from "zod";
import { type ApiError, apiRequest } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("uses cookie credentials and maps Problem Details without exposing response data", async () => {
  const fetchMock = vi.fn(async () =>
    Response.json(
      {
        type: "https://notesia.local/problems/forbidden",
        title: "No permitido.",
        status: 403,
        code: "FORBIDDEN",
        requestId: "request-test",
      },
      { status: 403, headers: { "Retry-After": "12" } },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);

  await expect(apiRequest("/v1/admin/system-health", z.unknown())).rejects.toMatchObject({
    status: 403,
    code: "FORBIDDEN",
    requestId: "request-test",
    retryAfterSeconds: 12,
  } satisfies Partial<ApiError>);
  expect(fetchMock).toHaveBeenCalledWith(
    "/v1/admin/system-health",
    expect.objectContaining({ credentials: "include" }),
  );
});
