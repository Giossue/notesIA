import { expect, test } from "bun:test";
import { readDeletionPolicy, readRecoveryConfig } from "./index";

const valid = {
  PASSWORD_RESET_URL: "https://app.example.test/reset-password",
  SMTP_HOST: "smtp.example.test",
  SMTP_FROM: "access@example.test",
};

test("recovery stays disabled until complete SMTP and reset URL configuration exists", () => {
  expect(readRecoveryConfig({})).toBeNull();
  expect(() => readRecoveryConfig({ SMTP_HOST: valid.SMTP_HOST })).toThrow();
  expect(() => readRecoveryConfig({ ...valid, SMTP_PASSWORD: "secret" })).toThrow();
  expect(() =>
    readRecoveryConfig({ ...valid, PASSWORD_RESET_URL: "http://example.test/reset" }),
  ).toThrow();
  expect(() => readRecoveryConfig({ ...valid, SMTP_SECURE: "false", SMTP_PORT: "465" })).toThrow();
  expect(readRecoveryConfig(valid)).toMatchObject({
    resetUrl: valid.PASSWORD_RESET_URL,
    smtp: { port: 587, secure: false },
  });
  expect(readRecoveryConfig({ ...valid, SMTP_PORT: "465" })).toMatchObject({
    smtp: { port: 465, secure: true },
  });
});

test("account deletion remains disabled until the full retention policy is configured", () => {
  expect(readDeletionPolicy({})).toBeNull();
  expect(() => readDeletionPolicy({ ACCOUNT_DELETION_GRACE_DAYS: "30" })).toThrow();
  const key = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64");
  expect(
    readDeletionPolicy({
      ACCOUNT_DELETION_GRACE_DAYS: "7",
      ACCOUNT_DELETION_AUDIT_RETENTION_DAYS: "365",
      ACCOUNT_DELETION_AUDIT_KEY: key,
    }),
  ).toMatchObject({ graceDays: 7, auditRetentionDays: 365 });
});
