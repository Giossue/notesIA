import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import type { Pool } from "pg";

const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const MAX_ATTEMPTS = 5;

function keyFromSecret(secret: string) {
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(secret),
      Buffer.from("notesia-recovery-mail-v1"),
      Buffer.from("encryption"),
      32,
    ),
  );
}

function associatedData(id: string, userId: string) {
  return Buffer.from(`${id}:${userId}`);
}

function encrypt(key: Buffer, id: string, userId: string, value: string) {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(associatedData(id, userId));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]);
}

function decrypt(key: Buffer, id: string, userId: string, payload: Buffer) {
  if (payload.length < NONCE_BYTES + TAG_BYTES) throw new Error("Invalid recovery payload");
  const nonce = payload.subarray(0, NONCE_BYTES);
  const tag = payload.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(associatedData(id, userId));
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(payload.subarray(NONCE_BYTES + TAG_BYTES)),
    decipher.final(),
  ]).toString("utf8");
}

type ClaimedMail = {
  id: string;
  userId: string;
  email: string;
  payload: Buffer;
  attempts: number;
  expiresAt: Date;
};

export function createRecoveryMailRepository(pool: Pool, secret: string) {
  const key = keyFromSecret(secret);
  return {
    async enqueue(userId: string, resetUrl: string, ttlSeconds: number) {
      const id = crypto.randomUUID();
      const payload = encrypt(key, id, userId, resetUrl);
      await pool.query(
        `INSERT INTO autenticacion.correos_recuperacion
          (id, usuario_id, contenido_cifrado, expira_en)
         VALUES ($1, $2, $3, now() + $4::integer * interval '1 second')`,
        [id, userId, payload, ttlSeconds],
      );
      return id;
    },
    async processOne(deliver: (email: string, resetUrl: string) => Promise<void>) {
      const claim = await pool.query<ClaimedMail>(
        `WITH next_mail AS (
           SELECT id FROM autenticacion.correos_recuperacion
           WHERE estado IN ('pending', 'sending') AND disponible_en <= now()
           ORDER BY disponible_en, id FOR UPDATE SKIP LOCKED LIMIT 1
         ), claimed AS (
           UPDATE autenticacion.correos_recuperacion m
           SET estado = 'sending', intentos = m.intentos + 1,
             disponible_en = now() + interval '2 minutes'
           FROM next_mail WHERE m.id = next_mail.id
           RETURNING m.id, m.usuario_id, m.contenido_cifrado, m.intentos, m.expira_en
         )
         SELECT c.id, c.usuario_id AS "userId", u.correo AS email,
           c.contenido_cifrado AS payload, c.intentos AS attempts,
           c.expira_en AS "expiresAt"
         FROM claimed c JOIN autenticacion.usuarios u ON u.id = c.usuario_id`,
      );
      const mail = claim.rows[0];
      if (!mail) return { kind: "empty" as const };
      if (mail.expiresAt <= new Date()) {
        await pool.query(
          `UPDATE autenticacion.correos_recuperacion
           SET estado = 'dead', contenido_cifrado = NULL, procesado_en = now()
           WHERE id = $1 AND estado = 'sending' AND intentos = $2`,
          [mail.id, mail.attempts],
        );
        return { kind: "expired" as const };
      }
      try {
        await deliver(mail.email, decrypt(key, mail.id, mail.userId, mail.payload));
        await pool.query(
          `UPDATE autenticacion.correos_recuperacion
           SET estado = 'done', contenido_cifrado = NULL, procesado_en = now()
           WHERE id = $1 AND estado = 'sending' AND intentos = $2`,
          [mail.id, mail.attempts],
        );
        return { kind: "delivered" as const };
      } catch {
        await pool.query(
          `UPDATE autenticacion.correos_recuperacion
           SET estado = CASE WHEN intentos >= $3 THEN 'dead' ELSE 'pending' END,
             contenido_cifrado = CASE WHEN intentos >= $3 THEN NULL ELSE contenido_cifrado END,
             disponible_en = now() + least(interval '2 minutes',
               power(2, least(intentos, 5)) * interval '5 seconds'),
             procesado_en = CASE WHEN intentos >= $3 THEN now() ELSE NULL END
           WHERE id = $1 AND estado = 'sending' AND intentos = $2`,
          [mail.id, mail.attempts, MAX_ATTEMPTS],
        );
        return { kind: "retry_scheduled" as const };
      }
    },
  };
}

export type RecoveryMailRepository = ReturnType<typeof createRecoveryMailRepository>;
