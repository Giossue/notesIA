import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import type { SecondaryStorage } from "@better-auth/core/db";
import type { Pool, PoolClient } from "pg";

const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;

function storageKey(secret: string, purpose: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", Buffer.from(secret), Buffer.from("notesia-auth-storage-v1"), purpose, 32),
  );
}

function lookupHash(secret: string, key: string): Buffer {
  return createHmac("sha256", storageKey(secret, "lookup")).update(key).digest();
}

function decryptValue(payload: Buffer, hash: Buffer, encryptionKey: Buffer): string {
  if (payload.length < NONCE_LENGTH + TAG_LENGTH) throw new Error("Invalid auth storage value");
  const nonce = payload.subarray(0, NONCE_LENGTH);
  const tag = payload.subarray(NONCE_LENGTH, NONCE_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, nonce);
  decipher.setAAD(hash);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(payload.subarray(NONCE_LENGTH + TAG_LENGTH)),
    decipher.final(),
  ]).toString("utf8");
}

type SessionPayload = {
  value: Record<string, unknown>;
  session: Record<string, unknown>;
  userId: string;
  version: unknown;
};

function sessionPayload(value: string): SessionPayload | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const root = parsed as Record<string, unknown>;
    const session = root.session;
    if (!session || typeof session !== "object" || Array.isArray(session)) return null;
    const fields = session as Record<string, unknown>;
    if (typeof fields.userId !== "string") return null;
    return {
      value: root,
      session: fields,
      userId: fields.userId,
      version: fields.notesiaAccountVersion,
    };
  } catch {
    return null;
  }
}

function versionMatches(stored: unknown, current: number) {
  return stored === current || (stored === undefined && current === 1);
}

export async function revokeUserSecureSessions(client: PoolClient, secret: string, userId: string) {
  const listHash = lookupHash(secret, `active-sessions-${userId}`);
  const found = await client.query<{ payload: Buffer | null }>(
    "SELECT contenido AS payload FROM autenticacion.almacen_seguro WHERE clave_hash = $1 FOR UPDATE",
    [listHash],
  );
  const payload = found.rows[0]?.payload;
  if (!payload) return;
  const raw = decryptValue(payload, listHash, storageKey(secret, "encryption"));
  const references: unknown = JSON.parse(raw);
  if (!Array.isArray(references) || references.length > 1000)
    throw new Error("Invalid active session references");
  const hashes = [listHash];
  for (const reference of references) {
    const token = (reference as { token?: unknown } | null)?.token;
    if (typeof token !== "string" || token.length < 1 || token.length > 4096)
      throw new Error("Invalid active session reference");
    hashes.push(lookupHash(secret, token));
  }
  await client.query(
    "DELETE FROM autenticacion.almacen_seguro WHERE clave_hash = ANY($1::bytea[])",
    [hashes],
  );
}

export async function purgeExpiredSecureStorage(pool: Pool, limit = 500) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw new Error("Invalid secure storage cleanup limit");
  const result = await pool.query(
    `WITH expired AS (
       SELECT clave_hash FROM autenticacion.almacen_seguro
       WHERE expira_en <= now()
       ORDER BY expira_en, clave_hash LIMIT $1 FOR UPDATE SKIP LOCKED
     )
     DELETE FROM autenticacion.almacen_seguro store
     USING expired WHERE store.clave_hash = expired.clave_hash`,
    [limit],
  );
  return result.rowCount ?? 0;
}

export function createSecureStorage(
  pool: Pool,
  secret: string,
  options: { requireVerifiedEmail?: boolean } = {},
): SecondaryStorage {
  const encryptionKey = storageKey(secret, "encryption");

  function keyHash(key: string): Buffer {
    return lookupHash(secret, key);
  }

  function encrypt(value: string, hash: Buffer): Buffer {
    const nonce = randomBytes(NONCE_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey, nonce);
    cipher.setAAD(hash);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]);
  }

  function decrypt(payload: Buffer, hash: Buffer): string {
    return decryptValue(payload, hash, encryptionKey);
  }

  return {
    async get(key) {
      const hash = keyHash(key);
      const result = await pool.query<{ payload: Buffer | null }>(
        "SELECT contenido AS payload FROM autenticacion.almacen_seguro WHERE clave_hash = $1 AND (expira_en IS NULL OR expira_en > now())",
        [hash],
      );
      const payload = result.rows[0]?.payload;
      if (!payload) return null;
      const value = decrypt(payload, hash);
      const session = sessionPayload(value);
      if (session) {
        const user = await pool.query<{ active: boolean; emailVerified: boolean; version: number }>(
          `SELECT suspendido_en IS NULL AS active, estado_version AS version,
             correo_verificado AS "emailVerified"
           FROM autenticacion.usuarios WHERE id = $1`,
          [session.userId],
        );
        if (
          !user.rows[0]?.active ||
          (options.requireVerifiedEmail && !user.rows[0].emailVerified) ||
          !versionMatches(session.version, user.rows[0].version)
        ) {
          await pool.query("DELETE FROM autenticacion.almacen_seguro WHERE clave_hash = $1", [
            hash,
          ]);
          return null;
        }
      }
      return value;
    },
    async getAndDelete(key) {
      const hash = keyHash(key);
      const result = await pool.query<{ payload: Buffer | null }>(
        "DELETE FROM autenticacion.almacen_seguro WHERE clave_hash = $1 AND (expira_en IS NULL OR expira_en > now()) RETURNING contenido AS payload",
        [hash],
      );
      const payload = result.rows[0]?.payload;
      return payload ? decrypt(payload, hash) : null;
    },
    async set(key, value, ttl) {
      const hash = keyHash(key);
      const session = sessionPayload(value);
      if (session) {
        const user = await pool.query<{ active: boolean; emailVerified: boolean; version: number }>(
          `SELECT suspendido_en IS NULL AS active, estado_version AS version,
             correo_verificado AS "emailVerified"
           FROM autenticacion.usuarios WHERE id = $1`,
          [session.userId],
        );
        const current = user.rows[0];
        if (!current?.active || (options.requireVerifiedEmail && !current.emailVerified))
          throw new Error("Session account is unavailable");
        const previous = await pool.query<{ payload: Buffer | null }>(
          "SELECT contenido AS payload FROM autenticacion.almacen_seguro WHERE clave_hash = $1",
          [hash],
        );
        let prior: SessionPayload | null = null;
        if (previous.rows[0]?.payload) {
          prior = sessionPayload(decrypt(previous.rows[0].payload, hash));
          if (
            !prior ||
            prior.userId !== session.userId ||
            !versionMatches(prior.version, current.version)
          )
            throw new Error("Stored session account version is invalid");
        }
        if (
          (session.version !== undefined && !versionMatches(session.version, current.version)) ||
          (session.version === undefined && !prior && current.version !== 1)
        )
          throw new Error("Session account version is invalid");
        session.session.notesiaAccountVersion = current.version;
        value = JSON.stringify(session.value);
      }
      const payload = encrypt(value, hash);
      await pool.query(
        `INSERT INTO autenticacion.almacen_seguro (clave_hash, contenido, expira_en, contador)
         VALUES ($1, $2, CASE WHEN $3::integer IS NULL THEN NULL ELSE now() + $3::integer * interval '1 second' END, 0)
         ON CONFLICT (clave_hash) DO UPDATE SET contenido = EXCLUDED.contenido,
           expira_en = EXCLUDED.expira_en, contador = 0`,
        [hash, payload, ttl ?? null],
      );
    },
    async delete(key) {
      await pool.query("DELETE FROM autenticacion.almacen_seguro WHERE clave_hash = $1", [
        keyHash(key),
      ]);
    },
    async increment(key, ttl) {
      const result = await pool.query<{ counter: number }>(
        `INSERT INTO autenticacion.almacen_seguro (clave_hash, contenido, expira_en, contador)
         VALUES ($1, NULL, now() + $2::integer * interval '1 second', 1)
         ON CONFLICT (clave_hash) DO UPDATE SET
           contador = CASE WHEN autenticacion.almacen_seguro.expira_en <= now() THEN 1 ELSE autenticacion.almacen_seguro.contador + 1 END,
           expira_en = CASE WHEN autenticacion.almacen_seguro.expira_en <= now() THEN EXCLUDED.expira_en ELSE autenticacion.almacen_seguro.expira_en END,
           contenido = NULL
         RETURNING contador AS counter`,
        [keyHash(key), ttl],
      );
      const counter = result.rows[0]?.counter;
      if (counter === undefined) throw new Error("Auth rate limit counter was not returned");
      return counter;
    },
  };
}
