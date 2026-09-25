import { currentTracePropagation, tracePropagation, withTraceSpan } from "@notesia/observability";
import type { Pool } from "pg";
import { createAuthMailCipher } from "./auth-mail-crypto";

const MAX_ATTEMPTS = 5;

type ClaimedMail = {
  id: string;
  userId: string;
  email: string;
  payload: Buffer;
  attempts: number;
  expiresAt: Date;
  traceId: string | null;
  sourceSpanId: string | null;
};

export function createVerificationMailRepository(pool: Pool, secret: string) {
  const cipher = createAuthMailCipher(secret, "notesia-verification-mail-v1");
  return {
    async enqueue(userId: string, verificationUrl: string, ttlSeconds: number) {
      const id = crypto.randomUUID();
      const payload = cipher.encrypt(id, userId, verificationUrl);
      await withTraceSpan(
        { name: "db.verification-mail.enqueue", component: "database", target: "postgresql" },
        async () => {
          const trace = currentTracePropagation();
          await pool.query(
            `INSERT INTO autenticacion.correos_verificacion
              (id, usuario_id, contenido_cifrado, expira_en, traza_id, span_origen_id)
             VALUES ($1, $2, $3, now() + $4::integer * interval '1 second', $5, $6)`,
            [id, userId, payload, ttlSeconds, trace?.traceId ?? null, trace?.spanId ?? null],
          );
        },
      );
      return id;
    },
    async processOne(deliver: (email: string, verificationUrl: string) => Promise<void>) {
      const claim = await pool.query<ClaimedMail>(
        `WITH next_mail AS (
           SELECT id FROM autenticacion.correos_verificacion
           WHERE estado IN ('pending', 'sending') AND disponible_en <= now()
           ORDER BY disponible_en, id FOR UPDATE SKIP LOCKED LIMIT 1
         ), claimed AS (
           UPDATE autenticacion.correos_verificacion m
           SET estado = 'sending', intentos = m.intentos + 1,
             disponible_en = now() + interval '2 minutes'
           FROM next_mail WHERE m.id = next_mail.id
           RETURNING m.id, m.usuario_id, m.contenido_cifrado, m.intentos, m.expira_en,
             m.traza_id, m.span_origen_id
         )
         SELECT c.id, c.usuario_id AS "userId", u.correo AS email,
           c.contenido_cifrado AS payload, c.intentos AS attempts,
           c.expira_en AS "expiresAt", c.traza_id AS "traceId",
           c.span_origen_id AS "sourceSpanId"
         FROM claimed c JOIN autenticacion.usuarios u ON u.id = c.usuario_id`,
      );
      const mail = claim.rows[0];
      if (!mail) return { kind: "empty" as const };
      return withTraceSpan(
        {
          name: "worker.verification-mail",
          component: "worker",
          parent: tracePropagation(mail.traceId, mail.sourceSpanId),
        },
        async () => {
          if (mail.expiresAt <= new Date()) {
            await pool.query(
              `UPDATE autenticacion.correos_verificacion
               SET estado = 'dead', contenido_cifrado = NULL, procesado_en = now()
               WHERE id = $1 AND estado = 'sending' AND intentos = $2`,
              [mail.id, mail.attempts],
            );
            return { kind: "expired" as const };
          }
          try {
            await deliver(mail.email, cipher.decrypt(mail.id, mail.userId, mail.payload));
            await pool.query(
              `UPDATE autenticacion.correos_verificacion
               SET estado = 'done', contenido_cifrado = NULL, procesado_en = now()
               WHERE id = $1 AND estado = 'sending' AND intentos = $2`,
              [mail.id, mail.attempts],
            );
            return { kind: "delivered" as const };
          } catch {
            await pool.query(
              `UPDATE autenticacion.correos_verificacion
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
      );
    },
  };
}

export type VerificationMailRepository = ReturnType<typeof createVerificationMailRepository>;
