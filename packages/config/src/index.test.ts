import { expect, test } from "bun:test";
import {
  readApiRuntimeConfig,
  readAuthMailConfig,
  readDeletionPolicy,
  readOperationalAlertConfig,
  readRecoveryConfig,
} from "./index";

const valid = {
  PASSWORD_RESET_URL: "https://app.example.test/reset-password",
  SMTP_HOST: "smtp.example.test",
  SMTP_FROM: "access@example.test",
};

test("API runtime defaults to loopback and requires an explicit production bind address", () => {
  expect(readApiRuntimeConfig({})).toEqual({
    hostname: "127.0.0.1",
    port: 3000,
    shutdownGraceMs: 10000,
  });
  expect(() => readApiRuntimeConfig({ NODE_ENV: "production" })).toThrow(
    "API_HOST must be set explicitly in production",
  );
  expect(
    readApiRuntimeConfig({
      NODE_ENV: "production",
      API_HOST: "0.0.0.0",
      PORT: "8080",
      API_SHUTDOWN_GRACE_SECONDS: "20",
    }),
  ).toEqual({ hostname: "0.0.0.0", port: 8080, shutdownGraceMs: 20000 });
  for (const port of ["0", "65536", "3.5", "invalid"])
    expect(() => readApiRuntimeConfig({ PORT: port })).toThrow("PORT must be a valid TCP port");
  expect(() => readApiRuntimeConfig({ API_HOST: "http://localhost" })).toThrow(
    "API_HOST must be a hostname or IP address",
  );
  expect(() => readApiRuntimeConfig({ API_SHUTDOWN_GRACE_SECONDS: "0" })).toThrow();
});

test("SMTP alone enables account mail while recovery also requires a reset URL", () => {
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
  expect(
    readAuthMailConfig({ SMTP_HOST: valid.SMTP_HOST, SMTP_FROM: valid.SMTP_FROM }),
  ).toMatchObject({ resetUrl: null, smtp: { host: valid.SMTP_HOST, from: valid.SMTP_FROM } });
  expect(readRecoveryConfig({ SMTP_HOST: valid.SMTP_HOST, SMTP_FROM: valid.SMTP_FROM })).toBeNull();
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

test("operational alerts require a signed HTTPS destination and bounded intervals", () => {
  expect(readOperationalAlertConfig({})).toBeNull();
  expect(() => readOperationalAlertConfig({ OPS_ALERT_SOURCE: "notesia-production" })).toThrow();
  const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64");
  const valid = {
    OPS_ALERT_WEBHOOK_URL: "https://alerts.example.test/notesia",
    OPS_ALERT_WEBHOOK_SECRET: secret,
    OPS_ALERT_SOURCE: "notesia-production",
  };
  expect(readOperationalAlertConfig(valid)).toMatchObject({
    webhookUrl: "https://alerts.example.test/notesia",
    source: "notesia-production",
    checkIntervalMs: 30000,
    repeatIntervalMs: 900000,
    aiCostLimitUsd15m: null,
  });
  expect(readOperationalAlertConfig(valid)?.secret.equals(Buffer.from(secret, "base64"))).toBe(
    true,
  );
  expect(() =>
    readOperationalAlertConfig({ ...valid, OPS_ALERT_WEBHOOK_URL: "http://alerts.example.test" }),
  ).toThrow();
  expect(() =>
    readOperationalAlertConfig({ ...valid, OPS_ALERT_WEBHOOK_URL: "not a URL with private data" }),
  ).toThrow("OPS_ALERT_WEBHOOK_URL must be a valid HTTPS URL");
  expect(() =>
    readOperationalAlertConfig({
      ...valid,
      OPS_ALERT_WEBHOOK_URL: "https://alerts.example.test/hook?token=private",
    }),
  ).toThrow();
  expect(() =>
    readOperationalAlertConfig({ ...valid, OPS_ALERT_WEBHOOK_SECRET: "not-a-key" }),
  ).toThrow();
  expect(() =>
    readOperationalAlertConfig({ ...valid, OPS_ALERT_SOURCE: "Production NotesIA" }),
  ).toThrow();
  expect(() =>
    readOperationalAlertConfig({ ...valid, OPS_ALERT_CHECK_INTERVAL_SECONDS: "9" }),
  ).toThrow();
  expect(() =>
    readOperationalAlertConfig({
      ...valid,
      OPS_ALERT_CHECK_INTERVAL_SECONDS: "120",
      OPS_ALERT_REPEAT_INTERVAL_SECONDS: "60",
    }),
  ).toThrow();
  expect(
    readOperationalAlertConfig({ ...valid, OPS_ALERT_AI_COST_LIMIT_USD_15M: "12.5" }),
  ).toMatchObject({ aiCostLimitUsd15m: "12.500000000" });
  for (const limit of ["0", "-1", "1e3", "1000000", "1.0000000000"])
    expect(() =>
      readOperationalAlertConfig({ ...valid, OPS_ALERT_AI_COST_LIMIT_USD_15M: limit }),
    ).toThrow();
});
