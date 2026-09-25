import { afterAll, expect, test } from "bun:test";
import { createRecoveryMailRepository } from "@notesia/db";
import { currentTraceContext } from "@notesia/observability";
import { createApp } from "../app";
import { createAuth } from "./create-auth";

const source = process.env.DATABASE_URL;
if (!source) throw new Error("DATABASE_URL is required for recovery integration tests");
const local = new URL(source);
if (
  !["127.0.0.1", "localhost", "::1"].includes(local.hostname) ||
  local.pathname !== "/notesia_dev"
)
  throw new Error("Recovery tests only run against local notesia_dev");

const secret = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
const email = `recovery-${crypto.randomUUID()}@example.test`;
const expiredEmail = `recovery-expired-${crypto.randomUUID()}@example.test`;
const created = createAuth({
  databaseUrl: local.toString(),
  secret,
  baseURL: "http://127.0.0.1:3000",
  allowSignUp: true,
  allowUnverifiedEmailForTests: true,
  recovery: { resetUrl: "https://notesia.example.test/reset-password" },
});
const app = createApp(async () => {}, created.auth.handler);
const recovery = createRecoveryMailRepository(created.pool, secret);

afterAll(async () => {
  await created.pool.query("DELETE FROM autenticacion.usuarios WHERE correo IN ($1,$2)", [
    email,
    expiredEmail,
  ]);
  await created.pool.end();
});

async function authPost(path: string, body: unknown) {
  return app.request(`/v1/auth/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
    body: JSON.stringify(body),
  });
}

test("recovery queues encrypted mail, hides account existence, consumes token and revokes sessions", async () => {
  const registered = await authPost("sign-up/email", {
    name: "Recovery Test",
    email,
    password: "OldRecoveryPassword2026!",
  });
  expect(registered.status).toBe(200);
  const cookie = registered.headers.get("set-cookie")?.split(";")[0] ?? "";
  const unknown = await authPost("request-password-reset", {
    email: `missing-${crypto.randomUUID()}@example.test`,
  });
  expect(unknown.status).toBe(200);
  const known = await authPost("request-password-reset", { email });
  expect(known.status).toBe(200);
  expect(await known.json()).toEqual(await unknown.json());

  const queuedTrace = known.headers.get("traceparent");
  expect(queuedTrace).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  const [, queuedTraceId, queuedSpanId] = queuedTrace?.split("-") ?? [];
  if (!queuedTraceId || !queuedSpanId) throw new Error("Missing recovery trace context");
  const stored = await created.pool.query<{
    encrypted: Buffer;
    traceId: string;
    sourceSpanId: string;
  }>(
    `SELECT contenido_cifrado AS encrypted, traza_id AS "traceId",
       span_origen_id AS "sourceSpanId" FROM autenticacion.correos_recuperacion m
     JOIN autenticacion.usuarios u ON u.id = m.usuario_id WHERE u.correo = $1`,
    [email],
  );
  expect(stored.rows).toHaveLength(1);
  expect(stored.rows[0]?.traceId).toBe(queuedTraceId);
  expect(stored.rows[0]?.sourceSpanId).toMatch(/^[0-9a-f]{16}$/);
  expect(stored.rows[0]?.sourceSpanId).not.toBe(queuedSpanId);
  let deliveredEmail = "";
  let deliveredUrl = "";
  let deliveryTrace: ReturnType<typeof currentTraceContext> = null;
  const delivered = await recovery.processOne(async (to, url) => {
    deliveredEmail = to;
    deliveredUrl = url;
    deliveryTrace = currentTraceContext();
  });
  expect(delivered.kind).toBe("delivered");
  expect(deliveryTrace).toMatchObject({
    traceId: stored.rows[0]?.traceId,
    parentSpanId: stored.rows[0]?.sourceSpanId,
  });
  expect(deliveredEmail).toBe(email);
  const token = new URL(deliveredUrl).searchParams.get("token");
  expect(token).toBeTruthy();
  expect(stored.rows[0]?.encrypted.includes(Buffer.from(token ?? ""))).toBe(false);
  expect(
    (
      await created.pool.query(
        "SELECT count(*)::integer AS count FROM autenticacion.verificaciones",
      )
    ).rows[0]?.count,
  ).toBe(0);
  const finalMail = await created.pool.query<{ state: string; payload: Buffer | null }>(
    `SELECT estado AS state, contenido_cifrado AS payload
     FROM autenticacion.correos_recuperacion m
     JOIN autenticacion.usuarios u ON u.id = m.usuario_id WHERE u.correo = $1`,
    [email],
  );
  expect(finalMail.rows[0]).toMatchObject({ state: "done", payload: null });

  const reset = await authPost("reset-password", {
    token,
    newPassword: "NewRecoveryPassword2026!",
  });
  expect(reset.status).toBe(200);
  const replay = await authPost("reset-password", {
    token,
    newPassword: "AnotherRecoveryPassword2026!",
  });
  expect(replay.status).toBe(400);
  const revoked = await app.request("/v1/auth/get-session", { headers: { cookie } });
  expect(((await revoked.json()) as { user?: unknown } | null)?.user).toBeUndefined();
  expect(
    (await authPost("sign-in/email", { email, password: "OldRecoveryPassword2026!" })).status,
  ).toBe(401);
  expect(
    (await authPost("sign-in/email", { email, password: "NewRecoveryPassword2026!" })).status,
  ).toBe(200);

  const owner = await created.pool.query<{ id: string }>(
    "SELECT id FROM autenticacion.usuarios WHERE correo = $1",
    [email],
  );
  const userId = owner.rows[0]?.id;
  expect(userId).toBeTruthy();
  const retryId = await recovery.enqueue(
    userId ?? "",
    "https://notesia.example.test/reset-password?token=retry-test",
    900,
  );
  expect(
    (
      await recovery.processOne(async () => {
        throw new Error("SMTP unavailable");
      })
    ).kind,
  ).toBe("retry_scheduled");
  const retryRow = await created.pool.query<{ state: string; attempts: number }>(
    `SELECT estado AS state, intentos AS attempts
     FROM autenticacion.correos_recuperacion WHERE id = $1`,
    [retryId],
  );
  expect(retryRow.rows[0]).toMatchObject({ state: "pending", attempts: 1 });
  await created.pool.query(
    "UPDATE autenticacion.correos_recuperacion SET disponible_en = now() WHERE id = $1",
    [retryId],
  );
  let deliveryCount = 0;
  const concurrent = await Promise.all([
    recovery.processOne(async () => {
      deliveryCount += 1;
    }),
    recovery.processOne(async () => {
      deliveryCount += 1;
    }),
  ]);
  expect(concurrent.map((result) => result.kind).sort()).toEqual(["delivered", "empty"]);
  expect(deliveryCount).toBe(1);

  const expiredId = await recovery.enqueue(
    userId ?? "",
    "https://notesia.example.test/reset-password?token=expired-test",
    1,
  );
  await created.pool.query(
    "UPDATE autenticacion.correos_recuperacion SET expira_en = now() - interval '1 second' WHERE id = $1",
    [expiredId],
  );
  expect(
    (
      await recovery.processOne(async () => {
        throw new Error("Must not send");
      })
    ).kind,
  ).toBe("expired");
});

test("an expired recovery token cannot reset the password", async () => {
  const shortSecret =
    crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  const short = createAuth({
    databaseUrl: local.toString(),
    secret: shortSecret,
    baseURL: "http://127.0.0.1:3000",
    allowSignUp: true,
    allowUnverifiedEmailForTests: true,
    recovery: { resetUrl: "https://notesia.example.test/reset-password", tokenTtlSeconds: 1 },
  });
  try {
    const shortApp = createApp(async () => {}, short.auth.handler);
    const register = await shortApp.request("/v1/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
      body: JSON.stringify({
        name: "Expired",
        email: expiredEmail,
        password: "OldRecoveryPassword2026!",
      }),
    });
    expect(register.status).toBe(200);
    const request = await shortApp.request("/v1/auth/request-password-reset", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
      body: JSON.stringify({ email: expiredEmail }),
    });
    expect(request.status).toBe(200);
    let url = "";
    const shortMail = createRecoveryMailRepository(short.pool, shortSecret);
    await shortMail.processOne(async (_to, sentUrl) => {
      url = sentUrl;
    });
    await Bun.sleep(1200);
    const result = await shortApp.request("/v1/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
      body: JSON.stringify({
        token: new URL(url).searchParams.get("token"),
        newPassword: "NewRecoveryPassword2026!",
      }),
    });
    expect(result.status).toBe(400);
  } finally {
    await short.pool.end();
  }
});
