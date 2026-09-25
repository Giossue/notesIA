import { describe, expect, test } from "bun:test";
import { createApp } from "./app";

describe("readiness", () => {
  test("returns Problem Details for unknown routes", async () => {
    const app = createApp(async () => {});
    const response = await app.request("/v1/unknown");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(await response.json()).toMatchObject({ code: "NOT_FOUND", status: 404 });
  });

  test("reports process health without a database call", async () => {
    const app = createApp(async () => {
      throw new Error("The health route should not touch the database");
    });
    const response = await app.request("/v1/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  test("reports ready after a database check", async () => {
    const app = createApp(async () => {});
    const response = await app.request("/v1/ready");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", database: "ready" });
  });

  test("returns a safe Problem Details response when database is unavailable", async () => {
    const app = createApp(async () => {
      throw new Error("private connection detail");
    });
    const response = await app.request("/v1/ready");
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(body.code).toBe("SERVICE_UNAVAILABLE");
    expect(JSON.stringify(body)).not.toContain("private connection detail");
    expect(response.headers.get("x-request-id")).toBe(body.requestId);
  });

  test("correlates success and missing-route responses with bounded HTTP observations", async () => {
    const observations: Array<{
      requestId: string;
      traceId: string;
      area: string;
      status: number;
      durationMs: number;
    }> = [];
    const traces: Array<{
      traceId: string;
      spanId: string;
      parentSpanId: string | null;
      name: string;
    }> = [];
    const app = createApp(
      async () => {},
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      (event) => observations.push(event),
      (event) => traces.push(event),
    );
    const healthy = await app.request("/v1/health");
    const missing = await app.request("/v1/user@example.test?token=private-value");
    const missingBody = await missing.json();
    expect(healthy.status).toBe(200);
    expect(healthy.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(healthy.headers.get("traceparent")).toBe(
      `00-${observations[0]?.traceId}-${traces[0]?.spanId}-01`,
    );
    expect(missing.status).toBe(404);
    expect(missing.headers.get("x-request-id")).toBe(missingBody.requestId);
    expect(observations).toMatchObject([
      { area: "health", status: 200, requestId: healthy.headers.get("x-request-id") },
      { area: "unknown", status: 404, requestId: missingBody.requestId },
    ]);
    expect(observations.every((event) => event.durationMs >= 0)).toBe(true);
    expect(traces).toMatchObject([
      { traceId: observations[0]?.traceId, parentSpanId: null, name: "api.request" },
      { traceId: observations[1]?.traceId, parentSpanId: null, name: "api.request" },
    ]);
    expect(JSON.stringify(observations)).not.toContain("private-value");
    expect(JSON.stringify(observations)).not.toContain("user@example.test");
  });

  test("continues a valid W3C traceparent and replaces invalid context", async () => {
    const incoming = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
    const app = createApp(async () => {});
    const continued = await app.request("/v1/health", { headers: { traceparent: incoming } });
    const continuedHeader = continued.headers.get("traceparent");
    expect(continuedHeader).toMatch(/^00-4bf92f3577b34da6a3ce929d0e0e4736-[0-9a-f]{16}-01$/);
    expect(continuedHeader).not.toBe(incoming);

    const invalid = await app.request("/v1/health", {
      headers: {
        traceparent: "00-00000000000000000000000000000000-0000000000000000-01",
      },
    });
    expect(invalid.headers.get("traceparent")).toMatch(
      /^00-(?!00000000000000000000000000000000)[0-9a-f]{32}-[0-9a-f]{16}-01$/,
    );
  });

  test("correlates unhandled server errors without revealing their cause", async () => {
    const app = createApp(
      async () => {},
      async () => {
        throw new Error("private failure detail");
      },
    );
    const response = await app.request("/v1/auth/sign-in/email", { method: "POST" });
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(response.headers.get("x-request-id")).toBe(body.requestId);
    expect(JSON.stringify(body)).not.toContain("private failure detail");
  });

  test("rejects an oversized streamed request before it reaches a route", async () => {
    const app = createApp(async () => {});
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(70000));
        controller.enqueue(new Uint8Array(70000));
        controller.close();
      },
    });
    const request = new Request("http://localhost/v1/unknown", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const response = await app.fetch(request);
    expect(response.status).toBe(413);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(await response.json()).toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });
});
