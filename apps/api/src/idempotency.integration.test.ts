import { afterAll, expect, test } from "bun:test";
import {
  type AdminRateLimiter,
  type AdminRepository,
  createIdempotencyRepository,
  createPrivacyRepository,
  createPushDeviceRepository,
  createPushTokenCipher,
  createRequestTransactionPool,
  createSubjectRepository,
} from "@notesia/db";
import { Pool } from "pg";
import { createApp } from "./app";
import { createAuth } from "./auth/create-auth";

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) throw new Error("DATABASE_URL is required for local integration tests");
const testUrl = new URL(sourceUrl);
if (
  !["127.0.0.1", "localhost", "::1"].includes(testUrl.hostname) ||
  testUrl.pathname !== "/notesia_dev"
) {
  throw new Error("Idempotency integration tests only run against local notesia_dev credentials");
}
const { auth, pool } = createAuth({
  databaseUrl: testUrl.toString(),
  secret: crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""),
  baseURL: "http://127.0.0.1:3000",
  allowSignUp: true,
  allowUnverifiedEmailForTests: true,
  rateLimitEnabled: false,
});
const getSession = (headers: Headers) => auth.api.getSession({ headers });
const domainPool = new Pool({ connectionString: testUrl.toString(), max: 10 });
const requestTransactions = createRequestTransactionPool(domainPool);
const repositoryPool = requestTransactions.pool;
const idempotency = createIdempotencyRepository(repositoryPool);
let failCompletion = false;
let adminAllowed = false;
const app = createApp(
  async () => {},
  auth.handler,
  undefined,
  { getSession, subjects: createSubjectRepository(repositoryPool) },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  {
    getSession,
    idempotency: {
      ...idempotency,
      async complete(...args: Parameters<typeof idempotency.complete>) {
        await idempotency.complete(...args);
        if (failCompletion) throw new Error("Simulated failure before transaction commit");
      },
    },
    withTransaction: requestTransactions.withTransaction,
  },
  undefined,
  { getSession, privacy: createPrivacyRepository(repositoryPool) },
  {
    getSession,
    admin: {
      isAdmin: async () => adminAllowed,
      hasFreshMfaSession: async () => true,
    } as unknown as AdminRepository,
    rateLimiter: {
      check: async () => ({ allowed: true, retryAfterSeconds: 1 }),
    } as AdminRateLimiter,
    verifyPassword: async () => true,
    allowedOrigin: "http://127.0.0.1:3000",
  },
  undefined,
  undefined,
  {
    getSession,
    devices: createPushDeviceRepository(repositoryPool),
    cipher: createPushTokenCipher(
      Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64"),
    ),
  },
);
const emailA = `idempotency-a-${crypto.randomUUID()}@example.test`;
const emailB = `idempotency-b-${crypto.randomUUID()}@example.test`;
const emailC = `idempotency-delete-${crypto.randomUUID()}@example.test`;
const emailD = `idempotency-admin-${crypto.randomUUID()}@example.test`;
const emailE = `idempotency-consent-${crypto.randomUUID()}@example.test`;
let cookieA = "";
let cookieB = "";
let cookieC = "";
let cookieD = "";
let cookieE = "";

async function register(email: string) {
  const response = await app.request("/v1/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
    body: JSON.stringify({ name: "Estudiante", email, password: "IdempotencyIntegration2026!" }),
  });
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}
afterAll(async () => {
  for (const cookie of [cookieA, cookieB, cookieC, cookieD, cookieE]) {
    if (cookie)
      await app.request("/v1/auth/sign-out", {
        method: "POST",
        headers: { cookie, origin: "http://127.0.0.1:3000" },
      });
  }
  await pool.query("DELETE FROM autenticacion.usuarios WHERE correo IN ($1,$2,$3,$4,$5)", [
    emailA,
    emailB,
    emailC,
    emailD,
    emailE,
  ]);
  await pool.end();
  await domainPool.end();
});

test("Idempotency-Key replays a successful no-content device removal", async () => {
  cookieC = await register(emailC);
  const id = crypto.randomUUID();
  const registered = await app.request("/v1/me/push-devices", {
    method: "POST",
    headers: { cookie: cookieC, "content-type": "application/json" },
    body: JSON.stringify({ id, platform: "android", token: `test-push-${crypto.randomUUID()}` }),
  });
  expect(registered.status).toBe(200);
  const key = crypto.randomUUID();
  const remove = () =>
    app.request(`/v1/me/push-devices/${id}`, {
      method: "DELETE",
      headers: { cookie: cookieC, "Idempotency-Key": key },
    });
  const first = await remove();
  expect(first.status).toBe(204);
  expect(await first.text()).toBe("");
  const replay = await remove();
  expect(replay.status).toBe(204);
  expect(await replay.text()).toBe("");
  expect(replay.headers.get("content-type")).toBeNull();
  const devices = await app.request("/v1/me/push-devices", { headers: { cookie: cookieC } });
  expect(await devices.json()).toEqual([]);
  expect(
    (
      await app.request(`/v1/me/push-devices/${id}`, {
        method: "DELETE",
        headers: { cookie: cookieC, "Idempotency-Key": crypto.randomUUID() },
      })
    ).status,
  ).toBe(404);
});

test("Idempotency-Key replays a committed mutation and is scoped to a user and body", async () => {
  cookieA = await register(emailA);
  cookieB = await register(emailB);
  const key = crypto.randomUUID();
  const subject = { id: crypto.randomUUID(), name: "Cálculo", colorToken: "primary" };
  const request = (cookie: string, body: unknown, idempotencyKey: string) =>
    app.request("/v1/subjects", {
      method: "POST",
      headers: { cookie, "content-type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
    });
  const first = await request(cookieA, subject, key);
  expect(first.status).toBe(201);
  const firstBody = await first.json();
  const replay = await request(cookieA, subject, key);
  expect(replay.status).toBe(201);
  expect(await replay.json()).toEqual(firstBody);
  const conflict = await request(cookieA, { ...subject, name: "Física" }, key);
  expect(conflict.status).toBe(409);
  expect(conflict.headers.get("content-type")).toContain("application/problem+json");
  const other = await request(cookieB, { ...subject, id: crypto.randomUUID() }, key);
  expect(other.status).toBe(201);
  const concurrentKey = crypto.randomUUID();
  const [concurrentA, concurrentB] = await Promise.all([
    request(cookieA, { ...subject, id: crypto.randomUUID(), name: "Álgebra" }, concurrentKey),
    request(cookieB, { ...subject, id: crypto.randomUUID(), name: "Álgebra" }, concurrentKey),
  ]);
  expect([concurrentA.status, concurrentB.status]).toEqual([201, 201]);
  const tenAtOnce = await Promise.all(
    // Cada materia necesita un nombre propio: el nombre es único por usuario.
    Array.from({ length: 10 }, (_, index) =>
      request(
        cookieA,
        { ...subject, id: crypto.randomUUID(), name: `Materia ${index}` },
        crypto.randomUUID(),
      ),
    ),
  );
  expect(tenAtOnce.map((response) => response.status)).toEqual(Array(10).fill(201));
  const updateKey = crypto.randomUUID();
  const update = () =>
    app.request(`/v1/subjects/${subject.id}`, {
      method: "PATCH",
      headers: {
        cookie: cookieA,
        "content-type": "application/json",
        "Idempotency-Key": updateKey,
      },
      body: JSON.stringify({ name: "Cálculo II", colorToken: "primary", version: 1 }),
    });
  const updated = await update();
  expect(updated.status).toBe(200);
  expect(await updated.json()).toMatchObject({ name: "Cálculo II", version: 2 });
  const updateReplay = await update();
  expect(updateReplay.status).toBe(200);
  expect(await updateReplay.json()).toMatchObject({ name: "Cálculo II", version: 2 });
});

test("failed response commit rolls back domain writes and permits the same key to retry", async () => {
  const subject = { id: crypto.randomUUID(), name: "Historia", colorToken: "primary" };
  const key = crypto.randomUUID();
  const create = () =>
    app.request("/v1/subjects", {
      method: "POST",
      headers: { cookie: cookieA, "content-type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(subject),
    });
  try {
    failCompletion = true;
    expect((await create()).status).toBe(500);
  } finally {
    failCompletion = false;
  }
  expect(
    (await app.request(`/v1/subjects/${subject.id}`, { headers: { cookie: cookieA } })).status,
  ).toBe(404);
  expect((await create()).status).toBe(201);
  expect((await create()).status).toBe(201);

  const deviceId = crypto.randomUUID();
  const deviceKey = crypto.randomUUID();
  const deviceBody = {
    id: deviceId,
    platform: "android",
    token: `test-push-${crypto.randomUUID()}`,
  };
  const registerDevice = () =>
    app.request("/v1/me/push-devices", {
      method: "POST",
      headers: {
        cookie: cookieA,
        "content-type": "application/json",
        "Idempotency-Key": deviceKey,
      },
      body: JSON.stringify(deviceBody),
    });
  try {
    failCompletion = true;
    expect((await registerDevice()).status).toBe(500);
  } finally {
    failCompletion = false;
  }
  const beforeRetry = await app.request("/v1/me/push-devices", { headers: { cookie: cookieA } });
  expect(await beforeRetry.json()).toEqual([]);
  expect((await registerDevice()).status).toBe(200);
  expect((await registerDevice()).status).toBe(200);
  const deleteKey = crypto.randomUUID();
  const remove = () =>
    app.request(`/v1/me/push-devices/${deviceId}`, {
      method: "DELETE",
      headers: { cookie: cookieA, "Idempotency-Key": deleteKey },
    });
  try {
    failCompletion = true;
    expect((await remove()).status).toBe(500);
  } finally {
    failCompletion = false;
  }
  const devices = await app.request("/v1/me/push-devices", { headers: { cookie: cookieA } });
  expect(await devices.json()).toMatchObject([{ id: deviceId }]);
  expect((await remove()).status).toBe(204);
  expect((await remove()).status).toBe(204);
});

test("an abandoned idempotency claim can be recovered without two active owners", async () => {
  const actor = await pool.query<{ id: string }>(
    "SELECT id FROM autenticacion.usuarios WHERE correo = $1",
    [emailA],
  );
  const claim = {
    userId: actor.rows[0]?.id ?? "",
    key: crypto.randomUUID(),
    method: "POST",
    path: "/v1/test-recovery",
    hash: "0".repeat(64),
  };
  const repository = createIdempotencyRepository(pool);
  const first = await repository.claim(claim);
  expect(first.kind).toBe("claimed");
  if (first.kind !== "claimed") throw new Error("Expected first claim");
  expect((await repository.claim(claim)).kind).toBe("pending");
  await pool.query(
    `UPDATE dominio.claves_idempotencia SET arrendado_hasta = now() - interval '1 second'
     WHERE usuario_id = $1 AND clave = $2`,
    [claim.userId, claim.key],
  );
  const recovered = await repository.claim(claim);
  expect(recovered.kind).toBe("claimed");
  if (recovered.kind !== "claimed") throw new Error("Expected recovered claim");
  expect(recovered.leaseId).not.toBe(first.leaseId);
  expect(await repository.renew(claim, first.leaseId)).toBe(false);
  await expect(
    repository.complete(claim, first.leaseId, 200, { ok: true }, "application/json"),
  ).rejects.toThrow("Idempotency claim was lost");
  await repository.complete(claim, recovered.leaseId, 200, { ok: true }, "application/json");
  expect(await repository.claim(claim)).toMatchObject({ kind: "replayed", body: { ok: true } });
});

test("admin authorization is reevaluated when the same key is retried", async () => {
  cookieD = await register(emailD);
  const key = crypto.randomUUID();
  const request = (requestKey: string, origin = "http://127.0.0.1:3000") =>
    app.request("/v1/admin/privacy-documents", {
      method: "POST",
      headers: {
        cookie: cookieD,
        origin,
        "content-type": "application/json",
        "Idempotency-Key": requestKey,
      },
      body: "{}",
    });
  adminAllowed = false;
  expect((await request(key)).status).toBe(403);
  try {
    adminAllowed = true;
    const next = await request(key);
    expect(next.status).toBe(422);
    expect(await next.json()).toMatchObject({ code: "VALIDATION_FAILED" });
    const secondKey = crypto.randomUUID();
    expect((await request(secondKey)).status).toBe(422);
    expect((await request(secondKey, "http://untrusted.test")).status).toBe(403);
    adminAllowed = false;
    expect((await request(secondKey)).status).toBe(403);
  } finally {
    adminAllowed = false;
  }
  const claimed = await pool.query("SELECT 1 FROM dominio.claves_idempotencia WHERE clave = $1", [
    key,
  ]);
  expect(claimed.rowCount).toBe(0);
});

test("consent decisions never replay from the generic response cache", async () => {
  cookieE = await register(emailE);
  const key = crypto.randomUUID();
  const response = await app.request("/v1/me/consents", {
    method: "POST",
    headers: {
      cookie: cookieE,
      "content-type": "application/json",
      "Idempotency-Key": key,
    },
    body: "{}",
  });
  expect(response.status).toBe(422);
  const claimed = await pool.query("SELECT 1 FROM dominio.claves_idempotencia WHERE clave = $1", [
    key,
  ]);
  expect(claimed.rowCount).toBe(0);
});
