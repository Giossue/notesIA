import { describe, expect, test } from "bun:test";
import { classifySyncResponse, retryDelayMs } from "./sync-policy";

describe("offline sync policy", () => {
  test("separates success, conflicts, permanent failures and retryable responses", () => {
    expect(classifySyncResponse(204)).toBe("success");
    expect(classifySyncResponse(401)).toBe("auth");
    expect(classifySyncResponse(409)).toBe("conflict");
    expect(classifySyncResponse(422)).toBe("failed");
    expect(classifySyncResponse(429)).toBe("retry");
    expect(classifySyncResponse(503)).toBe("retry");
  });

  test("uses bounded exponential backoff with jitter", () => {
    expect(retryDelayMs(1, 0)).toBe(1500);
    expect(retryDelayMs(1, 1)).toBe(2500);
    expect(retryDelayMs(20, 0.5)).toBe(300000);
  });
});
