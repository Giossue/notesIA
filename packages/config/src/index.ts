export type RecoveryConfig = {
  resetUrl: string;
  smtp: {
    host: string;
    from: string;
    port: number;
    secure: boolean;
    user?: string;
    password?: string;
    tlsServername?: string;
  };
};

export function readRecoveryConfig(env: NodeJS.ProcessEnv): RecoveryConfig | null {
  const names = [
    "PASSWORD_RESET_URL",
    "SMTP_HOST",
    "SMTP_FROM",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_TLS_SERVERNAME",
  ] as const;
  if (!names.some((name) => env[name])) return null;
  const resetUrl = env.PASSWORD_RESET_URL;
  const host = env.SMTP_HOST;
  const from = env.SMTP_FROM;
  if (!resetUrl || !host || !from)
    throw new Error("PASSWORD_RESET_URL, SMTP_HOST and SMTP_FROM must be set together");
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from))
    throw new Error("SMTP_FROM must be a plain email address");
  const parsedUrl = new URL(resetUrl);
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.hash ||
    parsedUrl.searchParams.has("token")
  )
    throw new Error("PASSWORD_RESET_URL must be HTTPS without credentials, hash or token");
  if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD))
    throw new Error("SMTP_USER and SMTP_PASSWORD must be set together");
  if (env.SMTP_SECURE && !["true", "false"].includes(env.SMTP_SECURE))
    throw new Error("SMTP_SECURE must be true or false");
  const port = Number(env.SMTP_PORT ?? (env.SMTP_SECURE === "true" ? 465 : 587));
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("SMTP_PORT must be a valid TCP port");
  if (port === 465 && env.SMTP_SECURE === "false")
    throw new Error("SMTP_SECURE=false is incompatible with port 465");
  return {
    resetUrl: parsedUrl.toString(),
    smtp: {
      host,
      from,
      port,
      secure: env.SMTP_SECURE === "true" || port === 465,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      tlsServername: env.SMTP_TLS_SERVERNAME,
    },
  };
}

export type DeletionPolicy = {
  graceDays: number;
  auditRetentionDays: number;
  auditKey: Buffer;
};

export function readDeletionPolicy(env: NodeJS.ProcessEnv): DeletionPolicy | null {
  const names = [
    "ACCOUNT_DELETION_GRACE_DAYS",
    "ACCOUNT_DELETION_AUDIT_RETENTION_DAYS",
    "ACCOUNT_DELETION_AUDIT_KEY",
  ] as const;
  if (!names.some((name) => env[name])) return null;
  if (names.some((name) => !env[name]))
    throw new Error(
      "Account deletion policy requires grace days, audit retention days and audit key",
    );
  const graceDays = Number(env.ACCOUNT_DELETION_GRACE_DAYS);
  const auditRetentionDays = Number(env.ACCOUNT_DELETION_AUDIT_RETENTION_DAYS);
  const encodedKey = env.ACCOUNT_DELETION_AUDIT_KEY as string;
  const auditKey = Buffer.from(encodedKey, "base64");
  if (!Number.isInteger(graceDays) || graceDays < 1 || graceDays > 90)
    throw new Error("ACCOUNT_DELETION_GRACE_DAYS must be between 1 and 90");
  if (!Number.isInteger(auditRetentionDays) || auditRetentionDays < 1 || auditRetentionDays > 3650)
    throw new Error("ACCOUNT_DELETION_AUDIT_RETENTION_DAYS must be between 1 and 3650");
  if (auditKey.length !== 32 || auditKey.toString("base64") !== encodedKey)
    throw new Error("ACCOUNT_DELETION_AUDIT_KEY must be canonical base64 for 32 bytes");
  return { graceDays, auditRetentionDays, auditKey };
}

export type OperationalAlertConfig = {
  webhookUrl: string;
  secret: Buffer;
  source: string;
  checkIntervalMs: number;
  repeatIntervalMs: number;
};

function integerSeconds(
  raw: string | undefined,
  fallback: number,
  name: string,
  minimum: number,
  maximum: number,
) {
  const value = Number(raw ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum)
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  return value;
}

export function readOperationalAlertConfig(env: NodeJS.ProcessEnv): OperationalAlertConfig | null {
  const names = [
    "OPS_ALERT_WEBHOOK_URL",
    "OPS_ALERT_WEBHOOK_SECRET",
    "OPS_ALERT_SOURCE",
    "OPS_ALERT_CHECK_INTERVAL_SECONDS",
    "OPS_ALERT_REPEAT_INTERVAL_SECONDS",
  ] as const;
  if (!names.some((name) => env[name])) return null;
  const webhookUrl = env.OPS_ALERT_WEBHOOK_URL;
  const encodedSecret = env.OPS_ALERT_WEBHOOK_SECRET;
  const source = env.OPS_ALERT_SOURCE;
  if (!webhookUrl || !encodedSecret || !source)
    throw new Error("Operational alerts require webhook URL, webhook secret and source");
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(webhookUrl);
  } catch {
    throw new Error("OPS_ALERT_WEBHOOK_URL must be a valid HTTPS URL");
  }
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.search ||
    parsedUrl.hash
  )
    throw new Error("OPS_ALERT_WEBHOOK_URL must be HTTPS without credentials, query or hash");
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(source))
    throw new Error("OPS_ALERT_SOURCE must be a lowercase deployment identifier");
  const secret = Buffer.from(encodedSecret, "base64");
  if (secret.length !== 32 || secret.toString("base64") !== encodedSecret)
    throw new Error("OPS_ALERT_WEBHOOK_SECRET must be canonical base64 for 32 bytes");
  const checkIntervalSeconds = integerSeconds(
    env.OPS_ALERT_CHECK_INTERVAL_SECONDS,
    30,
    "OPS_ALERT_CHECK_INTERVAL_SECONDS",
    10,
    300,
  );
  const repeatIntervalSeconds = integerSeconds(
    env.OPS_ALERT_REPEAT_INTERVAL_SECONDS,
    900,
    "OPS_ALERT_REPEAT_INTERVAL_SECONDS",
    60,
    86400,
  );
  if (repeatIntervalSeconds < checkIntervalSeconds)
    throw new Error(
      "OPS_ALERT_REPEAT_INTERVAL_SECONDS must not be shorter than the check interval",
    );
  return {
    webhookUrl: parsedUrl.toString(),
    secret,
    source,
    checkIntervalMs: checkIntervalSeconds * 1000,
    repeatIntervalMs: repeatIntervalSeconds * 1000,
  };
}
