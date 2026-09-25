import { afterAll, beforeAll, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createProfileRepository, createVerificationMailRepository } from "@notesia/db";
import { currentTraceContext } from "@notesia/observability";
import { Client, Pool } from "pg";
import { createApp } from "../app";
import { createAuth } from "./create-auth";

const source = process.env.DATABASE_URL;
if (!source) throw new Error("DATABASE_URL is required for email verification tests");
const local = new URL(source);
if (
  !["127.0.0.1", "localhost", "::1"].includes(local.hostname) ||
  local.pathname !== "/notesia_dev"
)
  throw new Error("Email verification tests require local notesia_dev credentials");

const name = `notesia_email_verification_test_${crypto.randomUUID().replaceAll("-", "")}`;
const url = new URL(local);
url.pathname = `/${name}`;
const admin = new Client({
  host: "127.0.0.1",
  port: Number(local.port || 5432),
  user: "postgres",
  database: "postgres",
});
let seed: Pool;
let runtime: Pool;

test("registration refuses to start without a verification mail transport", () => {
  expect(() =>
    createAuth({
      databaseUrl: url.toString(),
      secret: crypto.randomUUID().repeat(2),
      baseURL: "http://127.0.0.1:3000",
      allowSignUp: true,
    }),
  ).toThrow("SMTP configuration is required when account registration is enabled");
});

beforeAll(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  seed = new Pool({
    host: "127.0.0.1",
    port: Number(local.port || 5432),
    user: "postgres",
    database: name,
  });
  const migrations = join(import.meta.dir, "../../../../packages/db/migrations");
  for (const file of readdirSync(migrations)
    .filter((item) => /^\d{4}_.+\.sql$/.test(item))
    .sort())
    await seed.query(readFileSync(join(migrations, file), "utf8"));
  runtime = new Pool({ connectionString: url.toString() });
});

afterAll(async () => {
  await runtime?.end();
  await seed?.end();
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
});

test("registration requires an encrypted, expiring email verification before any session", async () => {
  const secret = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  const created = createAuth({
    databaseUrl: url.toString(),
    secret,
    baseURL: "http://127.0.0.1:3000",
    allowSignUp: true,
    rateLimitEnabled: false,
    verificationMail: { tokenTtlSeconds: 2 },
  });
  const app = createApp(async () => {}, created.handler, {
    getSession: created.getSession,
    profiles: createProfileRepository(created.pool),
  });
  const mail = createVerificationMailRepository(created.pool, secret);
  const email = `verified-${crypto.randomUUID()}@example.test`;
  const pendingEmail = `pending-${crypto.randomUUID()}@example.test`;
  const expiredEmail = `expired-${crypto.randomUUID()}@example.test`;
  const authPost = (path: string, body: unknown) =>
    app.request(`/v1/auth/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
      body: JSON.stringify(body),
    });

  try {
    const registration = await authPost("sign-up/email", {
      name: "Cuenta pendiente",
      email,
      password: "EmailVerification2026!",
    });
    expect(registration.status).toBe(200);
    expect(registration.headers.get("set-cookie")).toBeNull();
    expect(await registration.json()).toMatchObject({
      token: null,
      user: { email, emailVerified: false },
    });
    expect((await app.request("/v1/me")).status).toBe(401);

    const blocked = await authPost("sign-in/email", {
      email,
      password: "EmailVerification2026!",
    });
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    expect(blocked.headers.get("set-cookie")).toBeNull();

    const queuedTraceparent = registration.headers.get("traceparent");
    const [, traceId] = queuedTraceparent?.split("-") ?? [];
    const queued = await created.pool.query<{
      encrypted: Buffer;
      traceId: string;
      sourceSpanId: string;
    }>(
      `SELECT contenido_cifrado AS encrypted, traza_id AS "traceId",
         span_origen_id AS "sourceSpanId"
       FROM autenticacion.correos_verificacion v
       JOIN autenticacion.usuarios u ON u.id = v.usuario_id WHERE u.correo = $1`,
      [email],
    );
    expect(queued.rows).toHaveLength(1);
    expect(queued.rows[0]?.traceId).toBe(traceId);
    expect(queued.rows[0]?.sourceSpanId).toMatch(/^[0-9a-f]{16}$/);

    let deliveredTo = "";
    let verificationUrl = "";
    let deliveryTrace: ReturnType<typeof currentTraceContext> = null;
    expect(
      (
        await mail.processOne(async (to, sentUrl) => {
          deliveredTo = to;
          verificationUrl = sentUrl;
          deliveryTrace = currentTraceContext();
        })
      ).kind,
    ).toBe("delivered");
    expect(deliveredTo).toBe(email);
    expect(deliveryTrace).toMatchObject({
      traceId: queued.rows[0]?.traceId,
      parentSpanId: queued.rows[0]?.sourceSpanId,
    });
    const link = new URL(verificationUrl);
    const token = link.searchParams.get("token");
    expect(link.pathname).toBe("/v1/auth/verify-email");
    expect(link.searchParams.get("callbackURL")).toBe("notesia://email-verified");
    expect(token).toBeTruthy();
    expect(queued.rows[0]?.encrypted.includes(Buffer.from(token ?? ""))).toBe(false);

    const changedCallback = new URL(link);
    changedCallback.searchParams.set("callbackURL", "https://attacker.example.test/callback");
    const rejectedCallback = await app.request(
      `${changedCallback.pathname}${changedCallback.search}`,
    );
    expect(rejectedCallback.status).toBe(400);
    expect(await rejectedCallback.json()).toMatchObject({ code: "INVALID_CALLBACK_URL" });

    const verified = await app.request(`${link.pathname}${link.search}`, { redirect: "manual" });
    expect(verified.status).toBe(302);
    expect(verified.headers.get("location")).toBe("notesia://email-verified");
    expect(verified.headers.get("set-cookie")).toBeNull();
    const replay = await app.request(`${link.pathname}${link.search}`, { redirect: "manual" });
    expect(replay.status).toBe(302);
    expect(replay.headers.get("set-cookie")).toBeNull();

    const signedIn = await authPost("sign-in/email", {
      email,
      password: "EmailVerification2026!",
    });
    expect(signedIn.status).toBe(200);
    const cookie = signedIn.headers.get("set-cookie")?.split(";")[0] ?? "";
    expect(cookie).toBeTruthy();
    expect((await app.request("/v1/me", { headers: { cookie } })).status).toBe(200);

    await created.pool.query(
      "UPDATE autenticacion.usuarios SET correo_verificado = false WHERE correo = $1",
      [email],
    );
    expect((await app.request("/v1/me", { headers: { cookie } })).status).toBe(401);
    const staleSession = await app.request("/v1/auth/get-session", { headers: { cookie } });
    expect(staleSession.status).toBe(200);
    expect(await staleSession.json()).toBeNull();
    await created.pool.query(
      "UPDATE autenticacion.usuarios SET correo_verificado = true WHERE correo = $1",
      [email],
    );

    const duplicate = await authPost("sign-up/email", {
      name: "Respuesta indistinguible",
      email,
      password: "AnotherVerification2026!",
    });
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toMatchObject({ token: null, user: { email } });

    expect(
      (
        await authPost("sign-up/email", {
          name: "Cuenta pendiente dos",
          email: pendingEmail,
          password: "PendingVerification2026!",
        })
      ).status,
    ).toBe(200);
    const unknownResend = await authPost("send-verification-email", {
      email: `missing-${crypto.randomUUID()}@example.test`,
    });
    const pendingResend = await authPost("send-verification-email", { email: pendingEmail });
    const verifiedResend = await authPost("send-verification-email", { email });
    expect(unknownResend.status).toBe(200);
    expect(await pendingResend.json()).toEqual(await unknownResend.json());
    expect(await verifiedResend.json()).toEqual({ status: true });

    while ((await mail.processOne(async () => {})).kind !== "empty") {
      // Drain synthetic pending verification messages before the expiry case.
    }
    expect(
      (
        await authPost("sign-up/email", {
          name: "Enlace vencido",
          email: expiredEmail,
          password: "ExpiredVerification2026!",
        })
      ).status,
    ).toBe(200);
    let expiredUrl = "";
    await mail.processOne(async (_to, sentUrl) => {
      expiredUrl = sentUrl;
    });
    await Bun.sleep(2100);
    const expiredLink = new URL(expiredUrl);
    expiredLink.searchParams.delete("callbackURL");
    const expired = await app.request(`${expiredLink.pathname}${expiredLink.search}`);
    expect(expired.status).toBe(401);
    expect(await expired.json()).toMatchObject({ code: "TOKEN_EXPIRED" });
  } finally {
    await created.pool.end();
  }
});
