import { describe, expect, test } from "bun:test";
import { ApiResponseError, getReadiness } from "./readiness";

describe("getReadiness", () => {
  test("accepts a valid readiness response", async () => {
    const result = await getReadiness("http://127.0.0.1:3000/v1", async () =>
      Response.json({ status: "ok", database: "ready" }),
    );
    expect(result.database).toBe("ready");
  });

  test("shows a safe server error", async () => {
    expect(
      getReadiness("http://127.0.0.1:3000/v1", async () =>
        Response.json(
          {
            type: "https://notesia.local/problems/service-unavailable",
            title: "Servicio no disponible",
            status: 503,
            code: "SERVICE_UNAVAILABLE",
            requestId: "test-request",
          },
          { status: 503 },
        ),
      ),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });

  test("rejects unexpected server data", async () => {
    try {
      await getReadiness("http://127.0.0.1:3000/v1", async () => Response.json({ ready: true }));
      throw new Error("Expected an invalid response");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiResponseError);
      expect(error).toMatchObject({ code: "INVALID_RESPONSE" });
    }
  });

  test("gives a useful message when the API cannot be reached", async () => {
    expect(
      getReadiness("http://127.0.0.1:3000/v1", async () => {
        throw new TypeError("Failed to fetch");
      }),
    ).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      message: "No se pudo contactar al servidor local.",
    });
  });
});
