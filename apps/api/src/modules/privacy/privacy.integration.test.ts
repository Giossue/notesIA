import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AccountDeletionRepository } from "@notesia/db";
import {
  createAccountDeletionRepository,
  createAccountExportRepository,
  createAdminRateLimiter,
  createAdminRepository,
  createAiContextRepository,
  createAiRepository,
  createPrivacyRepository,
  createRecoveryMailRepository,
  createSecureStorage,
  createWorkerHealthRepository,
} from "@notesia/db";
import { Hono } from "hono";
import { Client, Pool } from "pg";
import { createApp } from "../../app";
import { createAuth } from "../../auth/create-auth";
import { acceptCurrentDocuments } from "../../test-consent";
import { registerAccountDeletionRoutes } from "../account-deletion/routes";
import { createAiGateway } from "../ai/gateway";
import { createAiKeyCipher } from "../ai/key-cipher";

const source = process.env.DATABASE_URL;
if (!source) throw new Error("DATABASE_URL is required for privacy integration tests");
const local = new URL(source);
if (
  !["127.0.0.1", "localhost", "::1"].includes(local.hostname) ||
  local.pathname !== "/notesia_dev"
)
  throw new Error("Privacy tests require local notesia_dev credentials");

const testName = `notesia_privacy_test_${crypto.randomUUID().replaceAll("-", "")}`;
const testUrl = new URL(local);
testUrl.pathname = `/${testName}`;
const admin = new Client({
  host: "127.0.0.1",
  port: Number(local.port || 5432),
  user: "postgres",
  database: "postgres",
});
let seed: Pool;
let authPool: Pool;
let authSecret: string;
let adminRateAt = new Date();
let app: ReturnType<typeof createApp>;
let deletions: AccountDeletionRepository;
const outboundAi: { url: string; body: unknown }[] = [];

beforeAll(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${testName}"`);
  seed = new Pool({
    host: "127.0.0.1",
    port: Number(local.port || 5432),
    user: "postgres",
    database: testName,
  });
  const files = readdirSync(join(import.meta.dir, "../../../../../packages/db/migrations"))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  for (const file of files)
    await seed.query(
      readFileSync(join(import.meta.dir, "../../../../../packages/db/migrations", file), "utf8"),
    );
  authSecret = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  const created = createAuth({
    databaseUrl: testUrl.toString(),
    secret: authSecret,
    baseURL: "http://127.0.0.1:3000",
    allowSignUp: true,
    allowUnverifiedEmailForTests: true,
    rateLimitEnabled: false,
  });
  authPool = created.pool;
  deletions = createAccountDeletionRepository(
    authPool,
    { graceDays: 1, auditRetentionDays: 365, auditKey: crypto.getRandomValues(Buffer.alloc(32)) },
    authSecret,
  );
  const ai = createAiRepository(authPool);
  const aiKeyCipher = createAiKeyCipher(crypto.getRandomValues(new Uint8Array(32)).toBase64());
  const fakeAiFetch = async (input: string, init: RequestInit) => {
    outboundAi.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    if (String(input).includes("anthropic.com"))
      return Response.json({
        stop_reason: "end_turn",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              title: "Resumen de biología",
              description: "Preparar un resumen",
            }),
          },
        ],
        usage: { input_tokens: 21, output_tokens: 14 },
      });
    return Response.json({
      status: "completed",
      output: [
        {
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                title: "Resumen de biología",
                description: "Preparar un resumen",
              }),
            },
          ],
        },
      ],
      usage: { input_tokens: 21, output_tokens: 14 },
    });
  };
  app = createApp(
    async () => {},
    created.auth.handler,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      getSession: (headers) => created.auth.api.getSession({ headers }),
      privacy: createPrivacyRepository(authPool),
    },
    {
      getSession: (headers) => created.auth.api.getSession({ headers }),
      admin: createAdminRepository(authPool, authSecret),
      rateLimiter: createAdminRateLimiter(authPool, authSecret, () => adminRateAt),
      verifyPassword: async (headers, password) => {
        try {
          return (await created.auth.api.verifyPassword({ headers, body: { password } })).status;
        } catch {
          return false;
        }
      },
      ai,
      aiKeyCipher,
      aiFetch: fakeAiFetch,
      allowedOrigin: "http://127.0.0.1:3000",
    },
    {
      getSession: (headers) => created.auth.api.getSession({ headers }),
      gateway: createAiGateway(ai, aiKeyCipher, fakeAiFetch),
      context: createAiContextRepository(authPool),
    },
    {
      getSession: (headers) => created.auth.api.getSession({ headers }),
      verifyPassword: async (headers, password) => {
        try {
          return (await created.auth.api.verifyPassword({ headers, body: { password } })).status;
        } catch {
          return false;
        }
      },
      exports: createAccountExportRepository(authPool),
    },
    undefined,
    {
      getSession: (headers) => created.auth.api.getSession({ headers }),
      verifyPassword: async (headers, password) => {
        try {
          return (await created.auth.api.verifyPassword({ headers, body: { password } })).status;
        } catch {
          return false;
        }
      },
      deletions,
    },
  );
});

afterAll(async () => {
  await authPool?.end();
  await seed?.end();
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS "${testName}" WITH (FORCE)`);
    await admin.end();
  }
});

async function register(email: string) {
  const result = await app.request("/v1/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
    body: JSON.stringify({ name: "Prueba", email, password: "PrivacyIntegration2026!" }),
  });
  expect(result.status).toBe(200);
  return result.headers.get("set-cookie")?.split(";")[0] ?? "";
}

function post(path: string, cookie: string, data?: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}

function totpFromUri(uri: string) {
  const secret = new URL(uri).searchParams.get("secret");
  if (!secret) throw new Error("TOTP secret missing from enrollment URI");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const symbol of secret.toUpperCase().replaceAll("=", "")) {
    const digit = alphabet.indexOf(symbol);
    if (digit < 0) throw new Error("Invalid TOTP secret");
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 255);
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, "0");
}

test("published documents, versioned consent, revocation and user isolation", async () => {
  const terms1 = crypto.randomUUID();
  const terms2 = crypto.randomUUID();
  const ai1 = crypto.randomUUID();
  await seed.query(
    `INSERT INTO dominio.documentos_privacidad (id, tipo, version, idioma, contenido)
     VALUES ($1, 'terms', 1, 'es', 'Texto de prueba'),
            ($2, 'terms', 2, 'es', 'Texto de prueba actualizado'),
            ($3, 'ai', 1, 'es', 'Texto de prueba de IA')`,
    [terms1, terms2, ai1],
  );
  expect(await (await app.request("/v1/privacy/documents")).json()).toEqual([]);
  expect((await app.request("/v1/me/consents")).status).toBe(401);
  expect((await post("/v1/me/consents", "", { documentId: terms1 })).status).toBe(401);
  await seed.query(
    "UPDATE dominio.documentos_privacidad SET publicado_en = now() WHERE id IN ($1,$2)",
    [terms1, ai1],
  );
  const documents = await app.request("/v1/privacy/documents?language=es");
  expect(documents.status).toBe(200);
  expect((await documents.json()) as unknown[]).toHaveLength(2);
  expect((await app.request("/v1/privacy/documents?language=en")).status).toBe(200);
  expect((await app.request("/v1/privacy/documents?language=xx")).status).toBe(422);
  expect(
    await seed
      .query("UPDATE dominio.documentos_privacidad SET contenido = 'Cambiado' WHERE id = $1", [
        terms1,
      ])
      .then(() => false)
      .catch(() => true),
  ).toBe(true);

  const cookieA = await register(`privacy-a-${crypto.randomUUID()}@example.test`);
  const cookieB = await register(`privacy-b-${crypto.randomUUID()}@example.test`);
  expect((await post("/v1/me/consents", cookieA, { documentId: terms2 })).status).toBe(409);
  const accepted = await post("/v1/me/consents", cookieA, { documentId: terms1 });
  expect(accepted.status).toBe(200);
  const acceptedBody = (await accepted.json()) as { id: string };
  expect(acceptedBody).toMatchObject({ type: "terms", version: 1, decision: "accepted" });
  const repeated = await post("/v1/me/consents", cookieA, { documentId: terms1 });
  expect(await repeated.json()).toMatchObject({ id: acceptedBody.id });
  expect((await post("/v1/me/consents", cookieA, { documentId: "bad" })).status).toBe(422);
  expect((await post("/v1/me/consents/ai/revoke", cookieA)).status).toBe(204);
  expect((await post("/v1/me/consents", cookieA, { documentId: ai1 })).status).toBe(200);
  const revoked = await post("/v1/me/consents/ai/revoke", cookieA);
  expect(revoked.status).toBe(200);
  expect(await revoked.json()).toMatchObject({ type: "ai", decision: "revoked" });
  expect(
    (await (
      await app.request("/v1/me/consents", { headers: { cookie: cookieA } })
    ).json()) as unknown[],
  ).toHaveLength(2);
  expect(
    await (await app.request("/v1/me/consents", { headers: { cookie: cookieB } })).json(),
  ).toEqual([]);
  await seed.query("UPDATE dominio.documentos_privacidad SET publicado_en = now() WHERE id = $1", [
    terms2,
  ]);
  expect((await post("/v1/me/consents", cookieA, { documentId: terms1 })).status).toBe(409);
  const latest = await post("/v1/me/consents", cookieA, { documentId: terms2 });
  expect(await latest.json()).toMatchObject({ type: "terms", version: 2, decision: "accepted" });
});

test("only an administrator can publish documents and each action is audited", async () => {
  const adminEmail = `privacy-admin-${crypto.randomUUID()}@example.test`;
  const studentEmail = `privacy-student-${crypto.randomUUID()}@example.test`;
  let adminCookie = await register(adminEmail);
  const studentCookie = await register(studentEmail);
  const actor = await seed.query<{ id: string }>(
    "SELECT id FROM autenticacion.usuarios WHERE correo = $1",
    [adminEmail],
  );
  const actorId = actor.rows[0]?.id;
  expect(actorId).toBeTruthy();
  await seed.query(
    "INSERT INTO autenticacion.roles_usuario (usuario_id, rol) VALUES ($1, 'admin')",
    [actorId],
  );
  expect((await app.request("/v1/admin/privacy-documents")).status).toBe(401);
  expect(
    (await app.request("/v1/admin/privacy-documents", { headers: { cookie: studentCookie } }))
      .status,
  ).toBe(403);
  const beforeMfa = await app.request("/v1/admin/privacy-documents", {
    headers: { cookie: adminCookie },
  });
  expect(beforeMfa.status).toBe(403);
  expect(await beforeMfa.json()).toMatchObject({ code: "MFA_REQUIRED" });
  const enrollment = await app.request("/v1/auth/two-factor/enable", {
    method: "POST",
    headers: {
      cookie: adminCookie,
      origin: "http://127.0.0.1:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify({ password: "PrivacyIntegration2026!", method: "totp" }),
  });
  expect(enrollment.status).toBe(200);
  const setup = (await enrollment.json()) as {
    method: string;
    totpURI: string;
    backupCodes: string[];
  };
  expect(setup.method).toBe("totp");
  expect(setup.backupCodes.length).toBeGreaterThan(0);
  const storedFactor = await seed.query<{ secret: string; backupCodes: string }>(
    `SELECT secreto AS secret, codigos_respaldo AS "backupCodes"
     FROM autenticacion.segundos_factores WHERE usuario_id = $1`,
    [actorId],
  );
  expect(
    storedFactor.rows[0]?.secret.includes(new URL(setup.totpURI).searchParams.get("secret") ?? ""),
  ).toBe(false);
  expect(storedFactor.rows[0]?.backupCodes.includes(setup.backupCodes[0] ?? "")).toBe(false);
  const verified = await app.request("/v1/auth/two-factor/verify-totp", {
    method: "POST",
    headers: {
      cookie: adminCookie,
      origin: "http://127.0.0.1:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify({ code: totpFromUri(setup.totpURI), trustDevice: false }),
  });
  expect(verified.status).toBe(200);
  const rotatedCookie = verified.headers.get("set-cookie")?.split(";")[0] ?? "";
  expect(rotatedCookie).toBeTruthy();
  expect(
    (await app.request("/v1/admin/privacy-documents", { headers: { cookie: adminCookie } })).status,
  ).toBe(401);
  adminCookie = rotatedCookie;
  expect(
    (await app.request("/v1/admin/privacy-documents", { headers: { cookie: adminCookie } })).status,
  ).toBe(200);
  const renewedCodes = await app.request("/v1/auth/two-factor/generate-backup-codes", {
    method: "POST",
    headers: {
      cookie: adminCookie,
      origin: "http://127.0.0.1:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify({ password: "PrivacyIntegration2026!" }),
  });
  expect(renewedCodes.status).toBe(200);
  const newCodes = (await renewedCodes.json()) as { status: boolean; backupCodes: string[] };
  expect(newCodes.status).toBe(true);
  expect(newCodes.backupCodes.length).toBeGreaterThan(0);
  expect(newCodes.backupCodes).not.toContain(setup.backupCodes[0]);
  await app.request("/v1/auth/sign-out", {
    method: "POST",
    headers: { cookie: adminCookie, origin: "http://127.0.0.1:3000" },
  });
  const backupSignIn = await app.request("/v1/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
    body: JSON.stringify({ email: adminEmail, password: "PrivacyIntegration2026!" }),
  });
  expect(await backupSignIn.clone().json()).toMatchObject({ twoFactorRedirect: true });
  const backupChallengeCookie = backupSignIn.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const oldBackupCode = await app.request("/v1/auth/two-factor/verify-backup-code", {
    method: "POST",
    headers: {
      cookie: backupChallengeCookie,
      origin: "http://127.0.0.1:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify({ code: setup.backupCodes[0], trustDevice: false }),
  });
  expect(oldBackupCode.status).toBe(401);
  const backupVerified = await app.request("/v1/auth/two-factor/verify-backup-code", {
    method: "POST",
    headers: {
      cookie: backupChallengeCookie,
      origin: "http://127.0.0.1:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify({ code: newCodes.backupCodes[0], trustDevice: false }),
  });
  expect(backupVerified.status).toBe(200);
  adminCookie = backupVerified.headers.get("set-cookie")?.split(";")[0] ?? "";
  expect(adminCookie).toBeTruthy();
  expect(
    (await app.request("/v1/admin/privacy-documents", { headers: { cookie: adminCookie } })).status,
  ).toBe(200);
  const healthPath = "/v1/admin/system-health";
  expect((await app.request(healthPath)).status).toBe(401);
  expect((await app.request(healthPath, { headers: { cookie: studentCookie } })).status).toBe(403);
  await createRecoveryMailRepository(authPool, authSecret).enqueue(
    actorId as string,
    "https://example.test/reset/synthetic",
    3600,
  );
  const health = await app.request(healthPath, { headers: { cookie: adminCookie } });
  expect(health.status).toBe(200);
  expect(health.headers.get("cache-control")).toBe("no-store");
  const healthText = await health.text();
  expect(JSON.parse(healthText)).toMatchObject({
    database: "ready",
    queues: {
      outbox: { pending: 0, ready: 0, inFlight: 0, dead: 0 },
      push: { pending: 0, ready: 0, inFlight: 0, dead: 0 },
      recoveryMail: { pending: 1, ready: 1, inFlight: 0, dead: 0 },
      verificationMail: { pending: 0, ready: 0, inFlight: 0, dead: 0 },
    },
    worker: { lastSeenAt: null, seenRecently: false },
    ai: {
      windowMinutes: 15,
      knownCostUsd: expect.stringMatching(/^\d+\.\d{9}$/),
      uncostedRequests: expect.any(Number),
      providers: expect.any(Array),
    },
  });
  expect(healthText).not.toContain(actorId as string);
  expect(healthText).not.toContain("synthetic");
  await createWorkerHealthRepository(authPool).beat();
  const withHeartbeat = await app.request(healthPath, { headers: { cookie: adminCookie } });
  expect(await withHeartbeat.json()).toMatchObject({
    worker: { lastSeenAt: expect.any(String), seenRecently: true },
  });
  await seed.query(
    "UPDATE dominio.latido_worker SET visto_en = now() - interval '3 minutes' WHERE id = true",
  );
  const oldHeartbeat = await app.request(healthPath, { headers: { cookie: adminCookie } });
  expect(await oldHeartbeat.json()).toMatchObject({ worker: { seenRecently: false } });
  const id = crypto.randomUUID();
  const draft = { id, type: "privacy", language: "en", version: 1, content: "Approved test text" };
  const noOrigin = await post("/v1/admin/privacy-documents", adminCookie, draft);
  expect(noOrigin.status).toBe(403);
  const created = await app.request("/v1/admin/privacy-documents", {
    method: "POST",
    headers: {
      cookie: adminCookie,
      origin: "http://127.0.0.1:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify(draft),
  });
  expect(created.status).toBe(201);
  expect(await created.json()).toMatchObject({ ...draft, publishedAt: null });
  expect((await post("/v1/admin/privacy-documents", studentCookie, draft)).status).toBe(403);
  expect(await (await app.request("/v1/privacy/documents?language=en")).json()).toEqual([]);
  const publishPath = `/v1/admin/privacy-documents/${id}/publish`;
  const headers = {
    cookie: adminCookie,
    origin: "http://127.0.0.1:3000",
    "content-type": "application/json",
  };
  expect((await app.request(publishPath, { method: "POST", headers, body: "{}" })).status).toBe(
    422,
  );
  const published = await app.request(publishPath, {
    method: "POST",
    headers,
    body: JSON.stringify({ confirmation: "PUBLICAR" }),
  });
  expect(published.status).toBe(200);
  expect(await published.json()).toMatchObject({ id, type: "privacy", version: 1 });
  expect(
    (
      await app.request(publishPath, {
        method: "POST",
        headers,
        body: JSON.stringify({ confirmation: "PUBLICAR" }),
      })
    ).status,
  ).toBe(200);
  expect(
    (await (await app.request("/v1/privacy/documents?language=en")).json()) as unknown[],
  ).toHaveLength(1);
  const audit = await app.request("/v1/admin/audit", { headers: { cookie: adminCookie } });
  expect(audit.status).toBe(200);
  const auditBody = (await audit.json()) as { items: Array<{ action: string; actorId: string }> };
  expect(auditBody.items.map((item) => item.action).sort()).toEqual([
    "privacy_document.created",
    "privacy_document.published",
  ]);
  expect(auditBody.items.every((item) => item.actorId === actorId)).toBe(true);
  expect(
    (await app.request("/v1/admin/audit", { headers: { cookie: studentCookie } })).status,
  ).toBe(403);

  const targetEmail = `privacy-suspended-${crypto.randomUUID()}@example.test`;
  const targetCookie = await register(targetEmail);
  const target = await seed.query<{ id: string }>(
    "SELECT id FROM autenticacion.usuarios WHERE correo = $1",
    [targetEmail],
  );
  const targetId = target.rows[0]?.id as string;
  const storage = createSecureStorage(authPool, authSecret);
  const orphanSessionKey = crypto.randomUUID();
  await storage.set(
    orphanSessionKey,
    JSON.stringify({ session: { userId: targetId, notesiaAccountVersion: 1 } }),
    3600,
  );
  expect(await storage.get(orphanSessionKey)).not.toBeNull();
  const usersPath = "/v1/admin/users";
  expect((await app.request(usersPath)).status).toBe(401);
  expect((await app.request(usersPath, { headers: { cookie: studentCookie } })).status).toBe(403);
  const users = await app.request(usersPath, { headers: { cookie: adminCookie } });
  expect(users.status).toBe(200);
  expect(users.headers.get("cache-control")).toBe("no-store");
  expect(await users.json()).toMatchObject({
    items: expect.arrayContaining([
      {
        id: targetId,
        email: targetEmail,
        name: "Prueba",
        role: null,
        suspendedAt: null,
        version: 1,
        createdAt: expect.any(String),
      },
    ]),
  });
  const suspensionHeaders = {
    cookie: adminCookie,
    origin: "http://127.0.0.1:3000",
    "content-type": "application/json",
  };
  const suspendPath = `/v1/admin/users/${targetId}/suspension`;
  const suspend = (path: string, body: unknown, cookie = adminCookie) =>
    app.request(path, {
      method: "PUT",
      headers: { ...suspensionHeaders, cookie },
      body: JSON.stringify(body),
    });
  const suspendBody = {
    suspended: true,
    version: 1,
    confirmation: "SUSPENDER",
    password: "PrivacyIntegration2026!",
  };
  expect((await suspend(suspendPath, suspendBody, studentCookie)).status).toBe(403);
  expect((await suspend(suspendPath, { ...suspendBody, confirmation: "REACTIVAR" })).status).toBe(
    422,
  );
  expect((await suspend(suspendPath, { ...suspendBody, password: "wrong" })).status).toBe(403);
  expect((await suspend(`/v1/admin/users/${actorId}/suspension`, suspendBody)).status).toBe(403);
  const suspended = await suspend(suspendPath, suspendBody);
  expect(suspended.status).toBe(200);
  expect(await suspended.json()).toMatchObject({
    userId: targetId,
    version: 2,
    suspendedAt: expect.any(String),
  });
  expect((await suspend(suspendPath, suspendBody)).status).toBe(409);
  expect((await app.request("/v1/me/consents", { headers: { cookie: targetCookie } })).status).toBe(
    401,
  );
  const targetSession = await app.request("/v1/auth/get-session", {
    headers: { cookie: targetCookie },
  });
  expect((await targetSession.json()) as { user?: unknown } | null).toBeNull();
  const targetSignIn = () =>
    app.request("/v1/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
      body: JSON.stringify({ email: targetEmail, password: "PrivacyIntegration2026!" }),
    });
  const banned = await targetSignIn();
  expect(banned.status).toBe(403);
  expect(await banned.json()).toMatchObject({ code: "ACCOUNT_SUSPENDED" });
  const restoredAccount = await suspend(suspendPath, {
    suspended: false,
    version: 2,
    confirmation: "REACTIVAR",
    password: "PrivacyIntegration2026!",
  });
  expect(restoredAccount.status).toBe(200);
  expect(await restoredAccount.json()).toMatchObject({
    userId: targetId,
    version: 3,
    suspendedAt: null,
  });
  expect(await storage.get(orphanSessionKey)).toBeNull();
  await expect(
    storage.set(
      crypto.randomUUID(),
      JSON.stringify({ session: { userId: targetId, notesiaAccountVersion: 1 } }),
      3600,
    ),
  ).rejects.toThrow("Session account version is invalid");
  const refreshedSessionKey = crypto.randomUUID();
  await storage.set(
    refreshedSessionKey,
    JSON.stringify({ session: { userId: targetId, notesiaAccountVersion: 3 } }),
    3600,
  );
  await storage.set(refreshedSessionKey, JSON.stringify({ session: { userId: targetId } }), 3600);
  expect(await storage.get(refreshedSessionKey)).not.toBeNull();
  expect((await app.request("/v1/me/consents", { headers: { cookie: targetCookie } })).status).toBe(
    401,
  );
  const freshTarget = await targetSignIn();
  expect(freshTarget.status).toBe(200);
  const targetFreshCookie = freshTarget.headers.get("set-cookie")?.split(";")[0] ?? "";
  expect(
    (await app.request("/v1/me/consents", { headers: { cookie: targetFreshCookie } })).status,
  ).toBe(200);
  const accountAudit = await app.request("/v1/admin/audit", {
    headers: { cookie: adminCookie },
  });
  const accountAuditBody = (await accountAudit.json()) as { items: Array<{ action: string }> };
  expect(accountAuditBody.items.map((item) => item.action)).toEqual(
    expect.arrayContaining(["account.suspended", "account.reactivated"]),
  );

  expect(
    (await app.request("/v1/admin/ai/providers", { headers: { cookie: studentCookie } })).status,
  ).toBe(403);
  const aiKey = `sk-test-${crypto.randomUUID()}`;
  const provider = await app.request("/v1/admin/ai/providers/openai", {
    method: "PUT",
    headers,
    body: JSON.stringify({ apiKey: aiKey, enabled: true, password: "PrivacyIntegration2026!" }),
  });
  expect(provider.status).toBe(200);
  const providers = await app.request("/v1/admin/ai/providers", {
    headers: { cookie: adminCookie },
  });
  const providersBody = await providers.text();
  expect(providersBody).not.toContain(aiKey);
  expect(JSON.parse(providersBody)).toMatchObject([{ provider: "openai", keyConfigured: true }]);
  const storedKey = await seed.query<{ key: Buffer }>(
    "SELECT clave_cifrada AS key FROM dominio.proveedores_ia WHERE proveedor = 'openai'",
  );
  expect(storedKey.rows[0]?.key.toString()).not.toContain(aiKey);
  const route = {
    provider: "openai",
    modelId: "test-model-1",
    timeoutMs: 3000,
    maxOutputTokens: 256,
    dailyBudgetTokens: 20000,
    inputPriceUsdPerMillion: "0.25",
    outputPriceUsdPerMillion: "1.25",
    enabled: true,
    capabilityReviewed: true,
    costReviewed: true,
    privacyReviewed: true,
    password: "PrivacyIntegration2026!",
  };
  const routePath = "/v1/admin/ai/routes/extract_activity";
  expect(
    (
      await app.request(routePath, {
        method: "PUT",
        headers,
        body: JSON.stringify({ ...route, privacyReviewed: false }),
      })
    ).status,
  ).toBe(422);
  expect(
    (
      await app.request(routePath, {
        method: "PUT",
        headers,
        body: JSON.stringify({ ...route, inputPriceUsdPerMillion: "-0.25" }),
      })
    ).status,
  ).toBe(422);
  expect(
    (await app.request(routePath, { method: "PUT", headers, body: JSON.stringify(route) })).status,
  ).toBe(200);
  expect(
    await (await app.request("/v1/admin/ai/routes", { headers: { cookie: adminCookie } })).json(),
  ).toMatchObject([
    {
      useCase: "extract_activity",
      inputPriceUsdPerMillion: "0.250000",
      outputPriceUsdPerMillion: "1.250000",
    },
  ]);
  const suggestionPath = "/v1/ai/extract_activity/suggestions";
  const suggest = () =>
    app.request(suggestionPath, {
      method: "POST",
      headers: { cookie: adminCookie, "content-type": "application/json" },
      body: JSON.stringify({ text: "Preparar resumen; escribir a estudiante@example.test" }),
    });
  expect((await suggest()).status).toBe(403);
  expect(outboundAi).toHaveLength(0);
  const nextAiVersion = await seed.query<{ version: number }>(
    "SELECT coalesce(max(version), 0)::integer + 1 AS version FROM dominio.documentos_privacidad WHERE tipo = 'ai' AND idioma = 'es'",
  );
  const aiDocumentId = crypto.randomUUID();
  await seed.query(
    `INSERT INTO dominio.documentos_privacidad
     (id, tipo, idioma, version, contenido, publicado_en)
     VALUES ($1, 'ai', 'es', $2, 'Documento sintético de prueba', now())`,
    [aiDocumentId, nextAiVersion.rows[0]?.version],
  );
  expect((await post("/v1/me/consents", adminCookie, { documentId: aiDocumentId })).status).toBe(
    200,
  );
  await acceptCurrentDocuments(app.request, adminCookie);
  const suggestion = await suggest();
  expect(suggestion.status).toBe(200);
  expect(await suggestion.json()).toMatchObject({
    kind: "suggestion",
    source: "ai",
    requiresConfirmation: true,
    value: { title: "Resumen de biología" },
  });
  expect(outboundAi).toHaveLength(1);
  expect(JSON.stringify(outboundAi[0]?.body)).not.toContain("estudiante@example.test");
  const usage = await seed.query<{ status: string; inputTokens: number }>(
    `SELECT estado AS status, tokens_entrada AS "inputTokens" FROM dominio.uso_ia
     WHERE usuario_id = $1`,
    [actorId],
  );
  expect(usage.rows).toMatchObject([{ status: "success", inputTokens: 21 }]);
  await seed.query("UPDATE dominio.uso_ia SET duracion_ms = 120 WHERE usuario_id = $1", [actorId]);
  const utcRange = await seed.query<{ from: string; through: string }>(
    `SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "from",
       to_char((now() AT TIME ZONE 'UTC') + interval '1 day', 'YYYY-MM-DD') AS through`,
  );
  const usagePath = `/v1/admin/ai/usage?from=${utcRange.rows[0]?.from}&through=${utcRange.rows[0]?.through}`;
  expect((await app.request(usagePath)).status).toBe(401);
  expect((await app.request(usagePath, { headers: { cookie: studentCookie } })).status).toBe(403);
  const usageResponse = await app.request(usagePath, { headers: { cookie: adminCookie } });
  expect(usageResponse.status).toBe(200);
  const usageText = await usageResponse.text();
  expect(JSON.parse(usageText)).toEqual({
    ...utcRange.rows[0],
    fallbacks: [],
    transitions: [],
    items: [
      {
        useCase: "extract_activity",
        provider: "openai",
        status: "success",
        requests: 1,
        reservedTokens: expect.any(Number),
        inputTokens: 21,
        outputTokens: 14,
        knownCostUsd: "0.000022750",
        totalCostUsd: "0.000022750",
        uncostedRequests: 0,
        averageDurationMs: 120,
        p95DurationMs: 120,
        unmeasuredRequests: 0,
      },
    ],
  });
  expect(usageText).not.toContain(actorId as string);
  expect(usageText).not.toContain(aiKey);
  expect(usageText).not.toContain("test-model-1");
  await seed.query(
    `UPDATE dominio.rutas_ia SET precio_entrada_usd_millon = 20,
       precio_salida_usd_millon = 40 WHERE caso = 'extract_activity'`,
  );
  expect(
    await (await app.request(usagePath, { headers: { cookie: adminCookie } })).json(),
  ).toMatchObject({ items: [{ totalCostUsd: "0.000022750" }] });
  const unknownUsageId = crypto.randomUUID();
  await seed.query(
    `INSERT INTO dominio.uso_ia
     (id, caso, proveedor, modelo_id, version_prompt, estado, tokens_reservados)
     VALUES ($1, 'extract_activity', 'openai', 'test-model-1', 1, 'error', 100)`,
    [unknownUsageId],
  );
  const measuredErrorIds = [crypto.randomUUID(), crypto.randomUUID()];
  await seed.query(
    `INSERT INTO dominio.uso_ia
     (id, caso, proveedor, modelo_id, version_prompt, estado, tokens_reservados, duracion_ms)
     VALUES ($1, 'extract_activity', 'openai', 'test-model-1', 1, 'error', 100, 100),
            ($2, 'extract_activity', 'openai', 'test-model-1', 1, 'error', 100, 300)`,
    measuredErrorIds,
  );
  expect(
    await (await app.request(usagePath, { headers: { cookie: adminCookie } })).json(),
  ).toMatchObject({
    items: [
      {
        status: "error",
        requests: 3,
        knownCostUsd: "0.000000000",
        totalCostUsd: null,
        uncostedRequests: 3,
        averageDurationMs: 200,
        p95DurationMs: 300,
        unmeasuredRequests: 1,
      },
      { status: "success", totalCostUsd: "0.000022750", uncostedRequests: 0 },
    ],
  });
  await seed.query("DELETE FROM dominio.uso_ia WHERE id = ANY($1::uuid[])", [
    [unknownUsageId, ...measuredErrorIds],
  ]);
  const uncertainUsageId = crypto.randomUUID();
  await seed.query(
    `INSERT INTO dominio.uso_ia
     (id, caso, proveedor, modelo_id, version_prompt, estado, tokens_reservados)
     VALUES ($1, 'extract_activity', 'openai', 'test-model-1', 1, 'unknown', 100)`,
    [uncertainUsageId],
  );
  expect(
    await (await app.request(usagePath, { headers: { cookie: adminCookie } })).json(),
  ).toMatchObject({
    items: [
      { status: "success" },
      { status: "unknown", requests: 1, totalCostUsd: null, unmeasuredRequests: 1 },
    ],
  });
  await seed.query("DELETE FROM dominio.uso_ia WHERE id = $1", [uncertainUsageId]);
  expect(
    await (
      await app.request("/v1/admin/ai/usage?from=2020-01-01&through=2020-01-02", {
        headers: { cookie: adminCookie },
      })
    ).json(),
  ).toEqual({
    from: "2020-01-01",
    through: "2020-01-02",
    fallbacks: [],
    transitions: [],
    items: [],
  });
  for (const path of [
    "/v1/admin/ai/usage?from=2026-01-01&through=2026-01-01",
    "/v1/admin/ai/usage?from=2026-01-01&through=2026-02-02",
    "/v1/admin/ai/usage?from=bad&through=2026-01-02",
  ]) {
    const invalid = await app.request(path, { headers: { cookie: adminCookie } });
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toMatchObject({ code: "VALIDATION_FAILED" });
  }
  expect(
    (
      await app.request(routePath, {
        method: "PUT",
        headers,
        body: JSON.stringify({ ...route, enabled: false }),
      })
    ).status,
  ).toBe(200);
  expect(await (await suggest()).json()).toMatchObject({
    kind: "manual",
    reason: "not_configured",
  });
  expect(outboundAi).toHaveLength(1);
  expect(
    await (await app.request(usagePath, { headers: { cookie: adminCookie } })).json(),
  ).toMatchObject({
    fallbacks: [{ useCase: "extract_activity", reason: "not_configured", requests: 1 }],
    transitions: [],
  });
  expect(
    (await app.request(routePath, { method: "PUT", headers, body: JSON.stringify(route) })).status,
  ).toBe(200);
  expect((await post("/v1/me/consents/ai/revoke", adminCookie)).status).toBe(200);
  expect((await suggest()).status).toBe(403);
  expect(outboundAi).toHaveLength(1);
  const providerTest = await app.request("/v1/admin/ai/routes/extract_activity/test", {
    method: "POST",
    headers: {
      cookie: adminCookie,
      origin: "http://127.0.0.1:3000",
      "content-type": "application/json",
    },
    body: "{}",
  });
  expect(providerTest.status).toBe(200);
  expect(outboundAi).toHaveLength(2);
  adminRateAt = new Date(adminRateAt.getTime() + 60_000);
  expect(
    (
      await app.request("/v1/admin/ai/providers/anthropic", {
        method: "PUT",
        headers,
        body: JSON.stringify({
          apiKey: `sk-test-${crypto.randomUUID()}`,
          enabled: true,
          password: "PrivacyIntegration2026!",
        }),
      })
    ).status,
  ).toBe(200);
  const alternate = {
    provider: "anthropic",
    modelId: "test-alternate-1",
    timeoutMs: 3000,
    maxOutputTokens: 256,
    inputPriceUsdPerMillion: "0.50",
    outputPriceUsdPerMillion: "2.00",
  };
  expect(
    (
      await app.request(routePath, {
        method: "PUT",
        headers,
        body: JSON.stringify({ ...route, alternate: { ...alternate, provider: "openai" } }),
      })
    ).status,
  ).toBe(422);
  expect(
    (
      await app.request(routePath, {
        method: "PUT",
        headers,
        body: JSON.stringify({ ...route, alternate }),
      })
    ).status,
  ).toBe(200);
  expect(
    await (
      await app.request("/v1/admin/ai/routes", {
        headers: { cookie: adminCookie },
      })
    ).json(),
  ).toMatchObject([{ alternate: { provider: "anthropic" } }]);
  expect(
    (
      await app.request("/v1/admin/ai/routes/extract_activity/test", {
        method: "POST",
        headers,
        body: "{}",
      })
    ).status,
  ).toBe(200);
  expect(outboundAi).toHaveLength(4);
  expect(outboundAi[3]?.url).toContain("anthropic.com");

  const student = await seed.query<{ id: string }>(
    "SELECT id FROM autenticacion.usuarios WHERE correo = $1",
    [studentEmail],
  );
  const studentId = student.rows[0]?.id;
  expect(studentId).toBeTruthy();
  const rolePath = `/v1/admin/roles/${studentId}`;
  const roleRequest = (data: unknown) =>
    app.request(rolePath, {
      method: "PUT",
      headers,
      body: JSON.stringify(data),
    });
  const assign = {
    role: "support",
    version: 0,
    confirmation: "ASIGNAR",
    password: "PrivacyIntegration2026!",
  };
  const wrongPassword = await roleRequest({ ...assign, password: "wrong" });
  expect(wrongPassword.status).toBe(403);
  expect(await wrongPassword.json()).toMatchObject({ code: "REAUTH_REQUIRED" });
  expect((await roleRequest(assign)).status).toBe(200);
  expect((await roleRequest(assign)).status).toBe(409);
  const roles = await app.request("/v1/admin/roles", { headers: { cookie: adminCookie } });
  expect(roles.status).toBe(200);
  expect(await roles.json()).toMatchObject({
    items: [
      { userId: studentId, role: "support", version: 1 },
      { userId: actorId, role: "admin", version: 1 },
    ],
  });
  expect(
    (await app.request("/v1/admin/roles", { headers: { cookie: studentCookie } })).status,
  ).toBe(403);
  expect((await roleRequest({ ...assign, role: "admin", version: 1 })).status).toBe(200);
  expect(
    (await app.request("/v1/admin/roles", { headers: { cookie: studentCookie } })).status,
  ).toBe(403);
  const remove = (userId: string, version: number) =>
    app.request(`/v1/admin/roles/${userId}`, {
      method: "DELETE",
      headers,
      body: JSON.stringify({
        version,
        confirmation: "QUITAR",
        password: "PrivacyIntegration2026!",
      }),
    });
  expect((await remove(actorId as string, 1)).status).toBe(403);
  expect((await remove(studentId as string, 1)).status).toBe(409);
  expect((await remove(studentId as string, 2)).status).toBe(200);
  expect((await app.request("/v1/admin/roles", { headers: { cookie: adminCookie } })).status).toBe(
    200,
  );

  await seed.query(
    `UPDATE dominio.preferencias_avisos SET anticipacion_plazo_minutos = 120
     WHERE usuario_id = $1`,
    [actorId],
  );
  const exportActivityId = crypto.randomUUID();
  const otherActivityId = crypto.randomUUID();
  const exportNoticeId = crypto.randomUUID();
  const otherNoticeId = crypto.randomUUID();
  const exportDeviceId = crypto.randomUUID();
  await seed.query(
    `INSERT INTO dominio.actividades
       (id, usuario_id, tipo, titulo, prioridad, fecha_limite, minutos_estimados)
     VALUES ($1,$2,'academic_task','Actividad exportable','medium',$5,60),
       ($3,$4,'academic_task','Actividad ajena','medium',$5,60)`,
    [exportActivityId, actorId, otherActivityId, studentId, "2026-10-05T12:00:00.000Z"],
  );
  await seed.query(
    `INSERT INTO dominio.notificaciones
       (id, usuario_id, tipo, actividad_id, referencia_en)
     VALUES ($1,$2,'deadline_reminder',$3,$5),
       ($4,$6,'deadline_reminder',$7,$5)`,
    [
      exportNoticeId,
      actorId,
      exportActivityId,
      otherNoticeId,
      "2026-10-05T12:00:00.000Z",
      studentId,
      otherActivityId,
    ],
  );
  await seed.query(
    `INSERT INTO dominio.dispositivos_push (id, usuario_id, plataforma, token_cifrado)
     VALUES ($1,$2,'android',$3)`,
    [exportDeviceId, actorId, Buffer.from("private-push-token")],
  );
  const exportPlanId = crypto.randomUUID();
  await seed.query(
    `INSERT INTO dominio.planes
       (id, usuario_id, estado, version_algoritmo, revision_origen,
        fecha_desde, fecha_hasta, sesion_minima, sesion_maxima, maximo_diario)
     VALUES ($1,$2,'active','deterministic-v2',1,
       '2026-10-05','2026-10-12',25,90,240)`,
    [exportPlanId, actorId],
  );
  await seed.query(
    `INSERT INTO dominio.riesgos_actuales
       (usuario_id, actividad_id, plan_id, revision_origen, version_algoritmo,
        minutos_restantes, minutos_capacidad, minutos_margen, nivel, razones,
        nivel_cambio_en, calculado_en)
     VALUES ($1,$2,$3,1,'deterministic-v2',60,30,-30,'high',
       ARRAY['insufficient_capacity'],now(),now())`,
    [actorId, exportActivityId, exportPlanId],
  );
  await seed.query(
    `INSERT INTO dominio.solicitudes_eliminacion
       (usuario_id, politica_hash, solicitada_en, ejecutar_en)
     VALUES ($1,$2,now(),now() + interval '1 day')`,
    [actorId, Buffer.alloc(32)],
  );
  const exportRequest = (cookie: string, password: string) =>
    app.request("/v1/me/export", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
  expect((await exportRequest("", "PrivacyIntegration2026!")).status).toBe(401);
  expect((await exportRequest(adminCookie, "wrong")).status).toBe(403);
  const exported = await exportRequest(adminCookie, "PrivacyIntegration2026!");
  expect(exported.status).toBe(200);
  expect(exported.headers.get("cache-control")).toBe("no-store");
  const exportText = await exported.text();
  const exportBody = JSON.parse(exportText) as {
    format: string;
    data: Record<string, Array<Record<string, unknown>>>;
  };
  expect(exportBody.format).toBe("notesia-export-v1");
  expect(exportBody.data.account).toMatchObject([{ email: adminEmail }]);
  expect(exportBody.data.roles).toMatchObject([{ role: "admin" }]);
  expect(exportBody.data.notificationPreferences).toMatchObject([{ deadlineLeadMinutes: 120 }]);
  expect(exportBody.data.notifications).toMatchObject([
    {
      id: exportNoticeId,
      activityId: exportActivityId,
      referenceAt: "2026-10-05T12:00:00.000Z",
    },
  ]);
  expect(exportBody.data.pushDevices).toMatchObject([{ id: exportDeviceId, platform: "android" }]);
  expect(exportBody.data.currentRisks).toMatchObject([
    { activityId: exportActivityId, planId: exportPlanId, level: "high" },
  ]);
  expect(exportBody.data.deletionRequest).toMatchObject([
    { status: "pending", executeAt: expect.any(String) },
  ]);
  expect(exportBody.data.consents?.length).toBeGreaterThan(0);
  expect(exportBody.data.aiUsage).toHaveLength(1);
  expect(exportText).not.toContain(studentEmail);
  expect(exportText).not.toContain(otherActivityId);
  expect(exportText).not.toContain(otherNoticeId);
  expect(exportText).not.toContain("private-push-token");
  expect(exportText).not.toContain(aiKey);
  expect(exportText).not.toContain("PrivacyIntegration2026!");

  const signOut = await app.request("/v1/auth/sign-out", {
    method: "POST",
    headers: { cookie: adminCookie, origin: "http://127.0.0.1:3000" },
  });
  expect(signOut.status).toBe(200);
  const signIn = await app.request("/v1/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
    body: JSON.stringify({ email: adminEmail, password: "PrivacyIntegration2026!" }),
  });
  expect(signIn.status).toBe(200);
  expect(await signIn.clone().json()).toMatchObject({ twoFactorRedirect: true });
  const challengeCookie = signIn.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  expect(challengeCookie).toBeTruthy();
  expect(
    (await app.request("/v1/admin/privacy-documents", { headers: { cookie: challengeCookie } }))
      .status,
  ).toBe(401);
  const reusedBackupCode = await app.request("/v1/auth/two-factor/verify-backup-code", {
    method: "POST",
    headers: {
      cookie: challengeCookie,
      origin: "http://127.0.0.1:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify({ code: newCodes.backupCodes[0], trustDevice: false }),
  });
  expect(reusedBackupCode.status).toBe(401);
  const wrongCode = await app.request("/v1/auth/two-factor/verify-totp", {
    method: "POST",
    headers: {
      cookie: challengeCookie,
      origin: "http://127.0.0.1:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify({ code: "000000", trustDevice: false }),
  });
  expect(wrongCode.status).toBe(401);
  const challengeVerified = await app.request("/v1/auth/two-factor/verify-totp", {
    method: "POST",
    headers: {
      cookie: challengeCookie,
      origin: "http://127.0.0.1:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify({ code: totpFromUri(setup.totpURI), trustDevice: false }),
  });
  expect(challengeVerified.status).toBe(200);
  const freshCookie = challengeVerified.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  expect(
    (await app.request("/v1/admin/privacy-documents", { headers: { cookie: freshCookie } })).status,
  ).toBe(200);
  const limiter = createAdminRateLimiter(authPool, authSecret, () => adminRateAt);
  let rate = await limiter.check(actorId as string, "POST");
  for (let index = 0; index < 30; index++) rate = await limiter.check(actorId as string, "POST");
  expect(rate.allowed).toBe(false);
  const limited = await app.request("/v1/admin/privacy-documents", {
    method: "POST",
    headers: {
      cookie: freshCookie,
      origin: "http://127.0.0.1:3000",
      "content-type": "application/json",
    },
    body: "{}",
  });
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toMatch(/^\d{1,2}$/);
  expect(await limited.json()).toMatchObject({ code: "RATE_LIMITED" });
  expect(
    (await app.request("/v1/admin/privacy-documents", { headers: { cookie: freshCookie } })).status,
  ).toBe(200);
  const disabled = await app.request("/v1/auth/two-factor/disable", {
    method: "POST",
    headers: {
      cookie: freshCookie,
      origin: "http://127.0.0.1:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify({ password: "PrivacyIntegration2026!" }),
  });
  expect(disabled.status).toBe(200);
  const disabledCookie = disabled.headers.get("set-cookie")?.split(";")[0] ?? "";
  expect(disabledCookie).toBeTruthy();
  expect(
    (await app.request("/v1/admin/privacy-documents", { headers: { cookie: freshCookie } })).status,
  ).toBe(401);
  const withoutMfa = await app.request("/v1/admin/privacy-documents", {
    headers: { cookie: disabledCookie },
  });
  expect(withoutMfa.status).toBe(403);
  expect(await withoutMfa.json()).toMatchObject({ code: "MFA_REQUIRED" });
  const reenrollment = await app.request("/v1/auth/two-factor/enable", {
    method: "POST",
    headers: {
      cookie: disabledCookie,
      origin: "http://127.0.0.1:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify({ password: "PrivacyIntegration2026!", method: "totp" }),
  });
  expect(reenrollment.status).toBe(200);
  const reenrolledSetup = (await reenrollment.json()) as { totpURI: string };
  const reenrolled = await app.request("/v1/auth/two-factor/verify-totp", {
    method: "POST",
    headers: {
      cookie: disabledCookie,
      origin: "http://127.0.0.1:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify({ code: totpFromUri(reenrolledSetup.totpURI), trustDevice: false }),
  });
  expect(reenrolled.status).toBe(200);
  const reenrolledCookie = reenrolled.headers.get("set-cookie")?.split(";")[0] ?? "";
  expect(
    (await app.request("/v1/admin/privacy-documents", { headers: { cookie: reenrolledCookie } }))
      .status,
  ).toBe(200);
});

test("deletion request, cancellation and due purge isolate users and revoke sessions", async () => {
  const path = "/v1/me/deletion-request";
  const emailA = `delete-a-${crypto.randomUUID()}@example.test`;
  const emailB = `delete-b-${crypto.randomUUID()}@example.test`;
  const cookieA = await register(emailA);
  const cookieB = await register(emailB);
  const users = await seed.query<{ id: string; email: string }>(
    `SELECT id, correo AS email FROM autenticacion.usuarios WHERE correo IN ($1,$2)`,
    [emailA, emailB],
  );
  const idA = users.rows.find((row) => row.email === emailA)?.id;
  const idB = users.rows.find((row) => row.email === emailB)?.id;
  expect(idA).toBeTruthy();
  expect(idB).toBeTruthy();
  const ruleA = crypto.randomUUID();
  const ruleB = crypto.randomUUID();
  await seed.query(
    `INSERT INTO dominio.reglas_disponibilidad (id, usuario_id, dia_semana, minuto_inicio, minuto_fin)
     VALUES ($1,$2,1,480,540),($3,$4,1,480,540)`,
    [ruleA, idA, ruleB, idB],
  );
  await seed.query(
    `INSERT INTO dominio.auditoria_admin (id, actor_id, accion, objetivo_id)
     VALUES ($1,$2,'role.assigned',$3),($4,$3,'role.removed',$2)`,
    [crypto.randomUUID(), idA, idB, crypto.randomUUID()],
  );

  const request = (cookie: string, password: string, confirmation = "ELIMINAR") =>
    post(path, cookie, { password, confirmation });
  expect((await request("", "PrivacyIntegration2026!")).status).toBe(401);
  expect((await request(cookieA, "wrong")).status).toBe(403);
  expect((await request(cookieA, "PrivacyIntegration2026!", "NO")).status).toBe(422);
  expect((await app.request(path, { headers: { cookie: cookieA } })).status).toBe(200);
  expect((await request(cookieA, "PrivacyIntegration2026!")).status).toBe(202);
  const first = await (await app.request(path, { headers: { cookie: cookieA } })).json();
  expect(first).toMatchObject({ status: "pending" });
  expect((await request(cookieA, "PrivacyIntegration2026!")).status).toBe(202);
  const eventsAfterRepeat = await seed.query<{ total: number }>(
    `SELECT count(*)::integer AS total FROM dominio.auditoria_eliminaciones
     WHERE accion = 'requested'`,
  );
  expect(eventsAfterRepeat.rows[0]?.total).toBe(1);

  const cancel = (password: string) =>
    app.request(path, {
      method: "DELETE",
      headers: { cookie: cookieA, "content-type": "application/json" },
      body: JSON.stringify({ password, confirmation: "CANCELAR" }),
    });
  expect((await cancel("wrong")).status).toBe(403);
  expect((await cancel("PrivacyIntegration2026!")).status).toBe(204);
  expect(await (await app.request(path, { headers: { cookie: cookieA } })).json()).toBeNull();
  expect((await request(cookieA, "PrivacyIntegration2026!")).status).toBe(202);
  expect((await deletions.processDue()).toString()).toBe("empty");
  const wrongPolicy = createAccountDeletionRepository(
    authPool,
    { graceDays: 2, auditRetentionDays: 365, auditKey: crypto.getRandomValues(Buffer.alloc(32)) },
    "unused-in-mismatch-check",
  );
  expect(await wrongPolicy.request(idA as string)).toEqual({ kind: "policy_mismatch" });

  const adminUser = await seed.query<{ id: string }>(
    `SELECT usuario_id AS id FROM autenticacion.roles_usuario WHERE rol = 'admin'`,
  );
  expect(adminUser.rows).toHaveLength(1);
  expect(await deletions.request(adminUser.rows[0]?.id as string)).toEqual({ kind: "last_admin" });

  // Move only this isolated test account's due date into the past.
  await seed.query(
    `UPDATE dominio.solicitudes_eliminacion
     SET solicitada_en = now() - interval '2 days', ejecutar_en = now() - interval '1 day'
     WHERE usuario_id = $1`,
    [idA],
  );
  expect(await wrongPolicy.processDue()).toBe("blocked");
  expect(await deletions.get(idA as string)).toMatchObject({
    status: "blocked",
    blockedReason: "policy_mismatch",
  });
  expect(await deletions.request(idA as string)).toMatchObject({ kind: "scheduled" });
  await seed.query(
    `UPDATE dominio.solicitudes_eliminacion
     SET solicitada_en = now() - interval '2 days', ejecutar_en = now() - interval '1 day'
     WHERE usuario_id = $1`,
    [idA],
  );
  expect(await deletions.processDue()).toBe("completed");
  expect(await deletions.processDue()).toBe("empty");
  expect((await app.request(path, { headers: { cookie: cookieA } })).status).toBe(401);
  const secureStorage = createSecureStorage(authPool, authSecret);
  await expect(
    secureStorage.set(
      "stale-test-session",
      JSON.stringify({ session: { userId: idA }, user: { id: idA } }),
      60,
    ),
  ).rejects.toThrow("Session account is unavailable");
  expect(await secureStorage.get("stale-test-session")).toBeNull();
  expect((await app.request(path, { headers: { cookie: cookieB } })).status).toBe(200);
  const after = await seed.query<{ id: string }>(
    `SELECT id FROM autenticacion.usuarios WHERE id IN ($1,$2)`,
    [idA, idB],
  );
  expect(after.rows).toEqual([{ id: idB as string }]);
  expect(
    (
      await seed.query(`SELECT id FROM dominio.reglas_disponibilidad WHERE id IN ($1,$2)`, [
        ruleA,
        ruleB,
      ])
    ).rows,
  ).toEqual([{ id: ruleB }]);
  expect(
    (
      await seed.query(`SELECT usuario_id FROM dominio.perfiles_usuario WHERE usuario_id = $1`, [
        idA,
      ])
    ).rowCount,
  ).toBe(0);
  const adminAudit = await seed.query<{ actorId: string; targetId: string }>(
    `SELECT actor_id AS "actorId", objetivo_id AS "targetId" FROM dominio.auditoria_admin
     WHERE actor_id = $1 OR objetivo_id = $1`,
    [idA],
  );
  expect(adminAudit.rows).toHaveLength(2);
  const deletionAudit = await seed.query<{ subjectHash: Buffer; action: string }>(
    `SELECT sujeto_hash AS "subjectHash", accion AS action
     FROM dominio.auditoria_eliminaciones ORDER BY registrada_en`,
  );
  expect(deletionAudit.rows.map((row) => row.action).sort()).toEqual([
    "cancelled",
    "completed",
    "requested",
    "requested",
    "requested",
  ]);
  expect(deletionAudit.rows.every((row) => row.subjectHash.length === 32)).toBe(true);
  expect(JSON.stringify(deletionAudit.rows)).not.toContain(idA as string);
  expect(JSON.stringify(deletionAudit.rows)).not.toContain(emailA);

  expect(
    await authPool
      .query(`DELETE FROM dominio.auditoria_eliminaciones WHERE accion = 'completed'`)
      .then(() => false)
      .catch(() => true),
  ).toBe(true);
  await seed.query(
    `UPDATE dominio.auditoria_eliminaciones
     SET registrada_en = now() - interval '2 days', expira_en = now() - interval '1 day'
     WHERE id = (SELECT id FROM dominio.auditoria_eliminaciones ORDER BY id LIMIT 1)`,
  );
  expect(await deletions.purgeExpiredAudit()).toBe(1);
});

test("deletion routes stay disabled without an approved policy", async () => {
  const disabled = new Hono();
  registerAccountDeletionRoutes(disabled, {
    getSession: async () => ({ user: { id: crypto.randomUUID() } }),
    verifyPassword: async () => true,
    deletions: null,
  });
  const response = await disabled.request("/v1/me/deletion-request");
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ code: "POLICY_UNAVAILABLE" });
});

test("sign up requires the current terms and a new version blocks the app until accepted", async () => {
  const withConsent = createAuth({
    databaseUrl: testUrl.toString(),
    secret: authSecret,
    baseURL: "http://127.0.0.1:3000",
    allowSignUp: true,
    allowUnverifiedEmailForTests: true,
    rateLimitEnabled: false,
    requireSignupConsent: true,
  });
  const nextVersion = async (type: "terms" | "privacy") =>
    (
      await seed.query<{ version: number }>(
        `SELECT coalesce(max(version), 0)::integer + 1 AS version
         FROM dominio.documentos_privacidad WHERE tipo = $1 AND idioma = 'es'`,
        [type],
      )
    ).rows[0]?.version;
  const publish = async (type: "terms" | "privacy") => {
    const id = crypto.randomUUID();
    await seed.query(
      `INSERT INTO dominio.documentos_privacidad (id, tipo, version, idioma, contenido, publicado_en)
       VALUES ($1, $2, $3, 'es', 'Texto de prueba', now())`,
      [id, type, await nextVersion(type)],
    );
    return id;
  };
  const terms = await publish("terms");
  const privacy = await publish("privacy");
  const signUp = (email: string, acceptedDocuments?: string[]) =>
    withConsent.handler(
      new Request("http://127.0.0.1:3000/v1/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://127.0.0.1:3000" },
        body: JSON.stringify({
          name: "Prueba",
          email,
          password: "PrivacyIntegration2026!",
          acceptedDocuments,
        }),
      }),
    );

  const rejectedEmail = `consent-missing-${crypto.randomUUID()}@example.test`;
  const rejected = await signUp(rejectedEmail, [terms]);
  expect(rejected.status).toBe(400);
  expect(await rejected.json()).toMatchObject({ code: "CONSENT_REQUIRED" });
  expect(
    (await seed.query("SELECT 1 FROM autenticacion.usuarios WHERE correo = $1", [rejectedEmail]))
      .rowCount,
  ).toBe(0);

  const email = `consent-ok-${crypto.randomUUID()}@example.test`;
  const accepted = await signUp(email, [terms, privacy]);
  expect(accepted.status).toBe(200);
  const cookie = accepted.headers.get("set-cookie")?.split(";")[0] ?? "";
  const recorded = await seed.query<{ documentId: string }>(
    `SELECT c.documento_id AS "documentId" FROM dominio.consentimientos c
     JOIN autenticacion.usuarios u ON u.id = c.usuario_id
     WHERE u.correo = $1 AND c.decision = 'accepted'`,
    [email],
  );
  expect(recorded.rows.map((row) => row.documentId).sort()).toEqual([terms, privacy].sort());
  // Aceptado todo, la API deja pasar (la ruta no existe en esta app de prueba).
  expect((await app.request("/v1/activities", { headers: { cookie } })).status).toBe(404);

  const terms2 = await publish("terms");
  const blocked = await app.request("/v1/activities", { headers: { cookie } });
  expect(blocked.status).toBe(403);
  expect(await blocked.json()).toMatchObject({ code: "CONSENT_REQUIRED" });
  // Leer y aceptar documentos, el perfil y cerrar sesión siguen disponibles.
  expect((await app.request("/v1/me/consents", { headers: { cookie } })).status).toBe(200);
  expect((await post("/v1/me/consents", cookie, { documentId: terms2 })).status).toBe(200);
  expect((await app.request("/v1/activities", { headers: { cookie } })).status).toBe(404);
  await withConsent.pool.end();
});

test("staff accounts sign in to the admin panel but never to the mobile app", async () => {
  const email = `staff-${crypto.randomUUID()}@example.test`;
  const password = "PrivacyIntegration2026!";
  await register(email);
  await seed.query(
    `INSERT INTO autenticacion.roles_usuario (usuario_id, rol)
     SELECT id, 'support' FROM autenticacion.usuarios WHERE correo = $1`,
    [email],
  );
  const signIn = (origin: string) =>
    app.request("/v1/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ email, password }),
    });
  const mobile = await signIn("notesia://");
  expect(mobile.status).toBe(403);
  expect(await mobile.json()).toMatchObject({ code: "STAFF_ACCOUNT" });
  expect((await signIn("http://127.0.0.1:3000")).status).toBe(200);
});
