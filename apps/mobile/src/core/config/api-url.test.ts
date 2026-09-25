import { describe, expect, test } from "bun:test";
import { normalizeApiBaseUrl } from "./api-url";

describe("mobile API URL", () => {
  test("uses loopback only for development and normalizes the configured URL", () => {
    expect(normalizeApiBaseUrl(undefined, true)).toBe("http://127.0.0.1:3000/v1");
    expect(normalizeApiBaseUrl("https://api.example.test/v1", false)).toBe(
      "https://api.example.test/v1",
    );
  });

  test("requires an explicit safe HTTPS URL in a release build", () => {
    expect(() => normalizeApiBaseUrl(undefined, false)).toThrow("no está configurada");
    expect(() => normalizeApiBaseUrl("http://api.example.test/v1", false)).toThrow("HTTPS");
    expect(() => normalizeApiBaseUrl("https://user@api.example.test/v1", false)).toThrow("HTTPS");
    expect(() => normalizeApiBaseUrl("https://api.example.test/v2", false)).toThrow("HTTPS");
  });
});
