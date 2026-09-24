import { createHash, createHmac } from "node:crypto";
import type { DeletionPolicy } from "@notesia/config";
import type { Pool, PoolClient } from "pg";
import { revokeUserSecureSessions } from "./auth-secure-storage";

export type DeletionRequest = {
  status: "pending" | "blocked";
  blockedReason: "last_admin" | "policy_mismatch" | null;
  requestedAt: Date;
  executeAt: Date;
};

type StoredDeletionRequest = DeletionRequest & { policyHash: Buffer };
const columns = `estado AS status, motivo_bloqueo AS "blockedReason",
  solicitada_en AS "requestedAt",
  ejecutar_en AS "executeAt"`;

function subjectHash(policy: DeletionPolicy, userId: string) {
  return createHmac("sha256", policy.auditKey).update(`account-deletion:${userId}`).digest();
}

function policyFingerprint(policy: DeletionPolicy) {
  return createHash("sha256")
    .update("notesia-account-deletion-policy-v1")
    .update(policy.auditKey)
    .update(`:${policy.graceDays}:${policy.auditRetentionDays}`)
    .digest();
}

async function audit(
  client: PoolClient,
  policy: DeletionPolicy,
  userId: string,
  action: "requested" | "cancelled" | "completed",
  at: Date,
) {
  await client.query(
    `INSERT INTO dominio.auditoria_eliminaciones
      (id, sujeto_hash, accion, registrada_en, expira_en)
     VALUES ($1,$2,$3,$4,$4::timestamptz + $5::integer * interval '1 day')`,
    [crypto.randomUUID(), subjectHash(policy, userId), action, at, policy.auditRetentionDays],
  );
}

export function createAccountDeletionRepository(
  pool: Pool,
  policy: DeletionPolicy,
  authSecret?: string,
) {
  const fingerprint = policyFingerprint(policy);
  return {
    async get(userId: string) {
      const result = await pool.query<DeletionRequest>(
        `SELECT ${columns} FROM dominio.solicitudes_eliminacion WHERE usuario_id = $1`,
        [userId],
      );
      return result.rows[0] ?? null;
    },
    async request(userId: string, at = new Date()) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('notesia-admin-roles'))");
        const administrator = await client.query(
          `SELECT 1 FROM autenticacion.roles_usuario r
           JOIN autenticacion.usuarios u ON u.id = r.usuario_id
           WHERE r.usuario_id = $1 AND r.rol = 'admin' AND u.suspendido_en IS NULL`,
          [userId],
        );
        if (administrator.rowCount) {
          const count = await client.query<{ total: number }>(
            `SELECT count(*)::integer AS total FROM autenticacion.roles_usuario r
             JOIN autenticacion.usuarios u ON u.id = r.usuario_id
             WHERE r.rol = 'admin' AND u.suspendido_en IS NULL`,
          );
          if ((count.rows[0]?.total ?? 0) <= 1) {
            await client.query("ROLLBACK");
            return { kind: "last_admin" as const };
          }
        }
        const current = await client.query<StoredDeletionRequest>(
          `SELECT ${columns}, politica_hash AS "policyHash" FROM dominio.solicitudes_eliminacion
           WHERE usuario_id = $1 FOR UPDATE`,
          [userId],
        );
        if (current.rows[0]?.status === "pending") {
          if (!current.rows[0].policyHash.equals(fingerprint)) {
            await client.query("ROLLBACK");
            return { kind: "policy_mismatch" as const };
          }
          await client.query("COMMIT");
          return { kind: "scheduled" as const, request: current.rows[0] };
        }
        const result = await client.query<DeletionRequest>(
          `INSERT INTO dominio.solicitudes_eliminacion
            (usuario_id, estado, politica_hash, solicitada_en, ejecutar_en)
           VALUES ($1, 'pending', $4, $2, $2::timestamptz + $3::integer * interval '1 day')
           ON CONFLICT (usuario_id) DO UPDATE SET estado = 'pending', motivo_bloqueo = NULL,
             politica_hash = EXCLUDED.politica_hash,
             solicitada_en = EXCLUDED.solicitada_en, ejecutar_en = EXCLUDED.ejecutar_en
           RETURNING ${columns}`,
          [userId, at, policy.graceDays, fingerprint],
        );
        await audit(client, policy, userId, "requested", at);
        await client.query("COMMIT");
        return { kind: "scheduled" as const, request: result.rows[0] as DeletionRequest };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    async cancel(userId: string, at = new Date()) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const deleted = await client.query(
          `DELETE FROM dominio.solicitudes_eliminacion WHERE usuario_id = $1 RETURNING usuario_id`,
          [userId],
        );
        if (deleted.rowCount) await audit(client, policy, userId, "cancelled", at);
        await client.query("COMMIT");
        return Boolean(deleted.rowCount);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    async processDue() {
      if (!authSecret) throw new Error("BETTER_AUTH_SECRET is required for account deletion");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('notesia-admin-roles'))");
        const due = await client.query<{ userId: string; policyHash: Buffer }>(
          `SELECT usuario_id AS "userId", politica_hash AS "policyHash"
           FROM dominio.solicitudes_eliminacion
           WHERE estado = 'pending' AND ejecutar_en <= now()
           ORDER BY ejecutar_en, usuario_id LIMIT 1 FOR UPDATE SKIP LOCKED`,
        );
        const userId = due.rows[0]?.userId;
        if (!userId) {
          await client.query("COMMIT");
          return "empty" as const;
        }
        if (!due.rows[0]?.policyHash.equals(fingerprint)) {
          await client.query(
            `UPDATE dominio.solicitudes_eliminacion
             SET estado = 'blocked', motivo_bloqueo = 'policy_mismatch' WHERE usuario_id = $1`,
            [userId],
          );
          await client.query("COMMIT");
          return "blocked" as const;
        }
        const admin = await client.query(
          `SELECT 1 FROM autenticacion.roles_usuario r
           JOIN autenticacion.usuarios u ON u.id = r.usuario_id
           WHERE r.usuario_id = $1 AND r.rol = 'admin' AND u.suspendido_en IS NULL`,
          [userId],
        );
        if (admin.rowCount) {
          const count = await client.query<{ total: number }>(
            `SELECT count(*)::integer AS total FROM autenticacion.roles_usuario r
             JOIN autenticacion.usuarios u ON u.id = r.usuario_id
             WHERE r.rol = 'admin' AND u.suspendido_en IS NULL`,
          );
          if ((count.rows[0]?.total ?? 0) <= 1) {
            await client.query(
              `UPDATE dominio.solicitudes_eliminacion
               SET estado = 'blocked', motivo_bloqueo = 'last_admin' WHERE usuario_id = $1`,
              [userId],
            );
            await client.query("COMMIT");
            return "blocked" as const;
          }
        }
        await revokeUserSecureSessions(client, authSecret, userId);
        await audit(client, policy, userId, "completed", new Date());
        await client.query(`DELETE FROM autenticacion.usuarios WHERE id = $1`, [userId]);
        await client.query("COMMIT");
        return "completed" as const;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    async purgeExpiredAudit() {
      const result = await pool.query<{ count: number }>(
        "SELECT dominio.purgar_auditoria_eliminaciones() AS count",
      );
      return result.rows[0]?.count ?? 0;
    },
  };
}

export type AccountDeletionRepository = ReturnType<typeof createAccountDeletionRepository>;
