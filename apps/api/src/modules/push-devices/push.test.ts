import { expect, test } from "bun:test";
import { createPushTokenCipher } from "@notesia/db";

test("push token ciphertext is bound to account and device", () => {
  const cipher = createPushTokenCipher(
    Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64"),
  );
  const user = crypto.randomUUID();
  const device = crypto.randomUUID();
  const token = `push-test-token-${crypto.randomUUID()}`;
  const encrypted = cipher.encrypt(user, device, token);
  expect(encrypted.toString()).not.toContain(token);
  expect(cipher.decrypt(user, device, encrypted)).toBe(token);
  expect(() => cipher.decrypt(crypto.randomUUID(), device, encrypted)).toThrow();
  expect(() => cipher.decrypt(user, crypto.randomUUID(), encrypted)).toThrow();
});
