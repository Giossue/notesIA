import type { Pool } from "pg";
import { revokeUserSecureSessions } from "./auth-secure-storage";
import type { PrivacyDocument, PrivacyLanguage, PrivacyType } from "./privacy-repository";

export type AdminDocument = Omit<PrivacyDocument, "publishedAt"> & {
  createdAt: Date;
  cursorCreatedAt: string;
  publishedAt: Date | null;
};
export type AdminAudit = {
  id: string;
  actorId: string;
  action:
    | "privacy_document.created"
    | "privacy_document.published"
    | "ai_provider.updated"
    | "ai_route.updated"
    | "ai_route.tested"
    | "role.assigned"
    | "role.changed"
    | "role.removed"
    | "account.suspended"
    | "account.reactivated"
    | "assistant_suggestion.created"
    | "assistant_suggestion.updated"
    | "assistant_suggestion.deleted";
  targetId: string;
  recordedAt: Date;
  actorEmail: string | null;
  targetEmail: string | null;
  documentType: "terms" | "privacy" | "ai" | null;
  documentVersion: number | null;
  provider: "openai" | "anthropic" | "deepseek" | null;
  suggestion: string | null;
  cursorRecordedAt: string;
};
type Cursor = { createdAt: string; id: string };
type CreateInput = {
  id: string;
  type: PrivacyType;
  version: number;
  language: PrivacyLanguage;
  content: string;
};

const documentColumns = `id, tipo AS type, version, idioma AS language,
  contenido AS content, publicado_en AS "publishedAt", creado_en AS "createdAt",
  to_char(creado_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    AS "cursorCreatedAt"`;

type QueueCounts = {
  pending: string;
  ready: string;
  inFlight: string;
  dead: string;
  oldestReadyAt: Date | null;
};
type AiProviderHealthRow = {
  provider: "openai" | "anthropic" | "deepseek";
  requests: string;
  successes: string;
  unavailable: string;
  errors: string;
};
type AiCostHealthRow = { knownCostUsd: string; uncostedRequests: string };
function safeCount(value: string | undefined) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0)
    throw new Error("Operational count is out of range");
  return number;
}
function safeUsd(value: string | undefined) {
  if (!value || !/^\d+\.\d{9}$/.test(value)) throw new Error("AI cost is out of range");
  return value;
}
function toQueueCounts(row: QueueCounts | undefined) {
  return {
    pending: safeCount(row?.pending),
    ready: safeCount(row?.ready),
    inFlight: safeCount(row?.inFlight),
    dead: safeCount(row?.dead),
    oldestReadyAt: row?.oldestReadyAt?.toISOString() ?? null,
  };
}

export function createAdminRepository(pool: Pool, authSecret: string) {
  return {
    async listUsers(cursor: { createdAt: string; id: string } | null) {
      const result = await pool.query<{
        id: string;
        email: string;
        name: string;
        role: "admin" | "support" | null;
        suspendedAt: Date | null;
        version: number;
        createdAt: Date;
        cursorCreatedAt: string;
      }>(
        `SELECT u.id, u.correo AS email, u.nombre AS name,
           r.rol AS role, u.suspendido_en AS "suspendedAt",
           u.estado_version AS version, u.creado_en AS "createdAt",
           to_char(u.creado_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
             AS "cursorCreatedAt"
         FROM autenticacion.usuarios u
         LEFT JOIN autenticacion.roles_usuario r ON r.usuario_id = u.id
         WHERE ($1::timestamptz IS NULL OR (u.creado_en, u.id) < ($1, $2::uuid))
         ORDER BY u.creado_en DESC, u.id DESC LIMIT 21`,
        [cursor?.createdAt ?? null, cursor?.id ?? null],
      );
      return result.rows;
    },
    /** Ficha de una cuenta: datos de acceso, perfil y cuánto usa la app. */
    async userDetail(userId: string) {
      const result = await pool.query<{
        id: string;
        email: string;
        name: string;
        emailVerified: boolean;
        twoFactorEnabled: boolean;
        role: "admin" | "support" | null;
        suspendedAt: Date | null;
        version: number;
        createdAt: Date;
        updatedAt: Date;
        displayName: string | null;
        timeZone: string | null;
        avatar: string | null;
        onboardingCompletedAt: Date | null;
        hasProfile: boolean;
        activities: number;
        completedActivities: number;
        commitments: number;
        studyHours: number;
        pushDevices: number;
        streakDays: string[];
        deletionRequestedAt: Date | null;
      }>(
        `SELECT u.id, u.correo AS email, u.nombre AS name,
           u.correo_verificado AS "emailVerified",
           u.segundo_factor_habilitado AS "twoFactorEnabled",
           r.rol AS role, u.suspendido_en AS "suspendedAt", u.estado_version AS version,
           u.creado_en AS "createdAt", u.actualizado_en AS "updatedAt",
           p.nombre AS "displayName", p.zona_horaria AS "timeZone", p.avatar,
           p.configuracion_inicial_en AS "onboardingCompletedAt",
           p.usuario_id IS NOT NULL AS "hasProfile",
           (SELECT count(*)::int FROM dominio.actividades a
            WHERE a.usuario_id = u.id AND a.eliminado_en IS NULL) AS activities,
           (SELECT count(*)::int FROM dominio.actividades a
            WHERE a.usuario_id = u.id AND a.eliminado_en IS NULL
              AND a.estado = 'completed') AS "completedActivities",
           (SELECT count(*)::int FROM dominio.eventos_calendario e
            WHERE e.usuario_id = u.id AND e.archivado_en IS NULL) AS commitments,
           (SELECT count(*)::int FROM dominio.reglas_disponibilidad rule
            WHERE rule.usuario_id = u.id AND rule.archivado_en IS NULL) AS "studyHours",
           (SELECT count(*)::int FROM dominio.dispositivos_push d
            WHERE d.usuario_id = u.id) AS "pushDevices",
           coalesce((SELECT array_agg(d.fecha::text) FROM dominio.dias_racha d
            WHERE d.usuario_id = u.id), '{}') AS "streakDays",
           (SELECT s.solicitada_en FROM dominio.solicitudes_eliminacion s
            WHERE s.usuario_id = u.id) AS "deletionRequestedAt"
         FROM autenticacion.usuarios u
         LEFT JOIN autenticacion.roles_usuario r ON r.usuario_id = u.id
         LEFT JOIN dominio.perfiles_usuario p ON p.usuario_id = u.id
         WHERE u.id = $1`,
        [userId],
      );
      return result.rows[0] ?? null;
    },
    async setSuspended(actorId: string, userId: string, suspended: boolean, version: number) {
      if (actorId === userId) return { kind: "self_change" as const };
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('notesia-admin-roles'))");
        const found = await client.query<{
          version: number;
          suspendedAt: Date | null;
          role: "admin" | "support" | null;
        }>(
          `SELECT u.estado_version AS version, u.suspendido_en AS "suspendedAt",
             r.rol AS role
           FROM autenticacion.usuarios u
           LEFT JOIN autenticacion.roles_usuario r ON r.usuario_id = u.id
           WHERE u.id = $1 FOR UPDATE OF u`,
          [userId],
        );
        const user = found.rows[0];
        if (!user) {
          await client.query("ROLLBACK");
          return { kind: "not_found" as const };
        }
        if (user.version !== version) {
          await client.query("ROLLBACK");
          return { kind: "version_conflict" as const };
        }
        if (Boolean(user.suspendedAt) === suspended) {
          await client.query("COMMIT");
          return { kind: "unchanged" as const, version, suspendedAt: user.suspendedAt };
        }
        // A un administrador no se lo suspende: primero hay que quitarle el rol.
        if (suspended && user.role === "admin") {
          await client.query("ROLLBACK");
          return { kind: "admin_target" as const };
        }
        if (suspended) await revokeUserSecureSessions(client, authSecret, userId);
        const changed = await client.query<{ version: number; suspendedAt: Date | null }>(
          `UPDATE autenticacion.usuarios
           SET suspendido_en = CASE WHEN $2::boolean THEN now() ELSE NULL END,
             estado_version = estado_version + 1
           WHERE id = $1 RETURNING estado_version AS version, suspendido_en AS "suspendedAt"`,
          [userId, suspended],
        );
        await client.query(
          `INSERT INTO dominio.auditoria_admin (id, actor_id, accion, objetivo_id)
           VALUES ($1,$2,$3,$4)`,
          [
            crypto.randomUUID(),
            actorId,
            suspended ? "account.suspended" : "account.reactivated",
            userId,
          ],
        );
        await client.query("COMMIT");
        return {
          kind: "changed" as const,
          version: changed.rows[0]?.version as number,
          suspendedAt: changed.rows[0]?.suspendedAt ?? null,
        };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    async systemHealth() {
      const [outbox, push, recoveryMail, verificationMail, heartbeat, aiProviders, aiCost] =
        await Promise.all([
          pool.query<QueueCounts>(
            `SELECT count(*) FILTER (WHERE estado = 'pending')::text AS pending,
             count(*) FILTER (WHERE estado = 'pending' AND disponible_en <= now())::text AS ready,
             '0'::text AS "inFlight",
             count(*) FILTER (WHERE estado = 'dead')::text AS dead,
             min(disponible_en) FILTER (WHERE estado = 'pending' AND disponible_en <= now())
               AS "oldestReadyAt"
           FROM dominio.bandeja_salida`,
          ),
          pool.query<QueueCounts>(
            `SELECT count(*) FILTER (WHERE estado = 'pending')::text AS pending,
             count(*) FILTER (WHERE estado = 'pending' AND disponible_en <= now())::text AS ready,
             count(*) FILTER (WHERE estado = 'sending')::text AS "inFlight",
             count(*) FILTER (WHERE estado = 'dead')::text AS dead,
             min(disponible_en) FILTER (WHERE estado = 'pending' AND disponible_en <= now())
               AS "oldestReadyAt"
           FROM dominio.envios_push`,
          ),
          pool.query<QueueCounts>(
            `SELECT count(*) FILTER (WHERE estado = 'pending')::text AS pending,
             count(*) FILTER (WHERE estado = 'pending' AND disponible_en <= now())::text AS ready,
             count(*) FILTER (WHERE estado = 'sending')::text AS "inFlight",
             count(*) FILTER (WHERE estado = 'dead')::text AS dead,
             min(disponible_en) FILTER (WHERE estado = 'pending' AND disponible_en <= now())
               AS "oldestReadyAt"
           FROM autenticacion.correos_recuperacion`,
          ),
          pool.query<QueueCounts>(
            `SELECT count(*) FILTER (WHERE estado = 'pending')::text AS pending,
             count(*) FILTER (WHERE estado = 'pending' AND disponible_en <= now())::text AS ready,
             count(*) FILTER (WHERE estado = 'sending')::text AS "inFlight",
             count(*) FILTER (WHERE estado = 'dead')::text AS dead,
             min(disponible_en) FILTER (WHERE estado = 'pending' AND disponible_en <= now())
               AS "oldestReadyAt"
           FROM autenticacion.correos_verificacion`,
          ),
          pool.query<{ lastSeenAt: Date; seenRecently: boolean }>(
            `SELECT visto_en AS "lastSeenAt",
             visto_en >= now() - interval '2 minutes' AS "seenRecently"
           FROM dominio.latido_procesos WHERE id = true`,
          ),
          pool.query<AiProviderHealthRow>(
            `SELECT proveedor AS provider,
             count(*) FILTER (WHERE estado <> 'reserved')::text AS requests,
             count(*) FILTER (WHERE estado = 'success')::text AS successes,
             count(*) FILTER (WHERE estado IN ('error','timeout'))::text AS unavailable,
             count(*) FILTER (WHERE estado IN ('error','timeout','invalid','unknown'))::text AS errors
           FROM dominio.uso_ia
           WHERE registrado_en >= now() - interval '15 minutes'
           GROUP BY proveedor
           HAVING count(*) FILTER (WHERE estado <> 'reserved') > 0
           ORDER BY proveedor`,
          ),
          pool.query<AiCostHealthRow>(
            `SELECT coalesce(sum(costo_usd) FILTER (WHERE estado <> 'reserved'), 0)
               ::numeric(24,9)::text AS "knownCostUsd",
             count(*) FILTER (WHERE estado <> 'reserved' AND costo_usd IS NULL)::text
               AS "uncostedRequests"
           FROM dominio.uso_ia
           WHERE registrado_en >= now() - interval '15 minutes'`,
          ),
        ]);
      return {
        queues: {
          outbox: toQueueCounts(outbox.rows[0]),
          push: toQueueCounts(push.rows[0]),
          recoveryMail: toQueueCounts(recoveryMail.rows[0]),
          verificationMail: toQueueCounts(verificationMail.rows[0]),
        },
        worker: {
          lastSeenAt: heartbeat.rows[0]?.lastSeenAt?.toISOString() ?? null,
          seenRecently: heartbeat.rows[0]?.seenRecently ?? false,
        },
        ai: {
          windowMinutes: 15 as const,
          knownCostUsd: safeUsd(aiCost.rows[0]?.knownCostUsd),
          uncostedRequests: safeCount(aiCost.rows[0]?.uncostedRequests),
          providers: aiProviders.rows.map((row) => ({
            provider: row.provider,
            requests: safeCount(row.requests),
            successes: safeCount(row.successes),
            unavailable: safeCount(row.unavailable),
            errors: safeCount(row.errors),
          })),
        },
      };
    },
    /** Rol del personal (admin o soporte) con la cuenta activa; null si no es personal. */
    async staffRole(userId: string) {
      const result = await pool.query<{ role: "admin" | "support" }>(
        `SELECT r.rol AS role FROM autenticacion.roles_usuario r
         JOIN autenticacion.usuarios u ON u.id = r.usuario_id
         WHERE r.usuario_id = $1 AND u.suspendido_en IS NULL LIMIT 1`,
        [userId],
      );
      return result.rows[0]?.role ?? null;
    },
    async isAdmin(userId: string) {
      const result = await pool.query(
        `SELECT 1 FROM autenticacion.roles_usuario r
         JOIN autenticacion.usuarios u ON u.id = r.usuario_id
         WHERE r.usuario_id = $1 AND r.rol = 'admin' AND u.suspendido_en IS NULL LIMIT 1`,
        [userId],
      );
      return result.rowCount === 1;
    },
    async hasFreshMfaSession(userId: string, sessionCreatedAt: Date) {
      const result = await pool.query(
        `SELECT 1 FROM autenticacion.usuarios u
         JOIN autenticacion.roles_usuario r ON r.usuario_id = u.id
         WHERE u.id = $1 AND r.rol IN ('admin', 'support')
           AND u.suspendido_en IS NULL
           AND u.segundo_factor_habilitado = true
           AND u.segundo_factor_activado_en IS NOT NULL
           AND $2::timestamptz > greatest(u.segundo_factor_activado_en, r.asignado_en)
         LIMIT 1`,
        [userId, sessionCreatedAt],
      );
      return result.rowCount === 1;
    },
    async listDocuments(cursor: Cursor | null) {
      const result = await pool.query<AdminDocument>(
        `SELECT ${documentColumns} FROM dominio.documentos_privacidad
         WHERE ($1::timestamptz IS NULL OR (creado_en, id) < ($1, $2::uuid))
         ORDER BY creado_en DESC, id DESC LIMIT 21`,
        [cursor?.createdAt ?? null, cursor?.id ?? null],
      );
      return result.rows;
    },
    async listAudit(cursor: { recordedAt: string; id: string } | null) {
      const result = await pool.query<AdminAudit>(
        `SELECT a.id, a.actor_id AS "actorId", a.accion AS action,
           a.objetivo_id AS "targetId", a.registrado_en AS "recordedAt",
           actor.correo AS "actorEmail", target.correo AS "targetEmail",
           document.tipo AS "documentType", document.version AS "documentVersion",
           provider.proveedor AS "provider", suggestion.texto AS "suggestion",
           to_char(a.registrado_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
             AS "cursorRecordedAt"
         FROM dominio.auditoria_admin a
         LEFT JOIN autenticacion.usuarios actor ON actor.id = a.actor_id
         LEFT JOIN autenticacion.usuarios target ON target.id = a.objetivo_id
         LEFT JOIN dominio.documentos_privacidad document ON document.id = a.objetivo_id
         LEFT JOIN dominio.proveedores_ia provider ON provider.id = a.objetivo_id
         LEFT JOIN dominio.sugerencias_asistente suggestion ON suggestion.id = a.objetivo_id
         WHERE ($1::timestamptz IS NULL OR (a.registrado_en, a.id) < ($1, $2::uuid))
         ORDER BY a.registrado_en DESC, a.id DESC LIMIT 21`,
        [cursor?.recordedAt ?? null, cursor?.id ?? null],
      );
      return result.rows;
    },
    async createDocument(actorId: string, input: CreateInput) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `admin-document:${input.type}:${input.language}`,
        ]);
        const latest = await client.query<{ version: number | null }>(
          `SELECT max(version)::integer AS version FROM dominio.documentos_privacidad
           WHERE tipo = $1 AND idioma = $2`,
          [input.type, input.language],
        );
        if (input.version <= (latest.rows[0]?.version ?? 0)) {
          await client.query("ROLLBACK");
          return { kind: "version_conflict" as const };
        }
        const inserted = await client.query<AdminDocument>(
          `INSERT INTO dominio.documentos_privacidad
            (id, tipo, version, idioma, contenido)
           VALUES ($1,$2,$3,$4,$5) RETURNING ${documentColumns}`,
          [input.id, input.type, input.version, input.language, input.content],
        );
        await client.query(
          `INSERT INTO dominio.auditoria_admin (id, actor_id, accion, objetivo_id)
           VALUES ($1,$2,'privacy_document.created',$3)`,
          [crypto.randomUUID(), actorId, input.id],
        );
        await client.query("COMMIT");
        return { kind: "created" as const, row: inserted.rows[0] };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        if ((error as { code?: string }).code === "23505")
          return { kind: "version_conflict" as const };
        throw error;
      } finally {
        client.release();
      }
    },
    async publishDocument(actorId: string, id: string) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const found = await client.query<AdminDocument>(
          `SELECT ${documentColumns} FROM dominio.documentos_privacidad
           WHERE id = $1 FOR UPDATE`,
          [id],
        );
        const document = found.rows[0];
        if (!document) {
          await client.query("ROLLBACK");
          return { kind: "not_found" as const };
        }
        if (document.publishedAt) {
          await client.query("COMMIT");
          return { kind: "published" as const, row: document };
        }
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `admin-document:${document.type}:${document.language}`,
        ]);
        const newer = await client.query(
          `SELECT 1 FROM dominio.documentos_privacidad
           WHERE tipo = $1 AND idioma = $2 AND publicado_en IS NOT NULL
             AND version >= $3 LIMIT 1`,
          [document.type, document.language, document.version],
        );
        if (newer.rowCount) {
          await client.query("ROLLBACK");
          return { kind: "version_conflict" as const };
        }
        const published = await client.query<AdminDocument>(
          `UPDATE dominio.documentos_privacidad SET publicado_en = now()
           WHERE id = $1 RETURNING ${documentColumns}`,
          [id],
        );
        await client.query(
          `INSERT INTO dominio.auditoria_admin (id, actor_id, accion, objetivo_id)
           VALUES ($1,$2,'privacy_document.published',$3)`,
          [crypto.randomUUID(), actorId, id],
        );
        await client.query("COMMIT");
        return { kind: "published" as const, row: published.rows[0] };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    async listRoles(cursor: { assignedAt: string; id: string } | null) {
      const result = await pool.query<{
        userId: string;
        email: string;
        role: "admin" | "support";
        version: number;
        assignedAt: Date;
        cursorAssignedAt: string;
        updatedAt: Date;
      }>(
        `SELECT r.usuario_id AS "userId", u.correo AS email, r.rol AS role,
           r.version, r.asignado_en AS "assignedAt", r.actualizado_en AS "updatedAt",
           to_char(r.asignado_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
             AS "cursorAssignedAt"
         FROM autenticacion.roles_usuario r
         JOIN autenticacion.usuarios u ON u.id = r.usuario_id
         WHERE ($1::timestamptz IS NULL OR (r.asignado_en, r.usuario_id) < ($1, $2::uuid))
         ORDER BY r.asignado_en DESC, r.usuario_id DESC LIMIT 21`,
        [cursor?.assignedAt ?? null, cursor?.id ?? null],
      );
      return result.rows;
    },
    async assignRole(actorId: string, userId: string, role: "admin" | "support", version: number) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('notesia-admin-roles'))");
        const user = await client.query<{ active: boolean }>(
          "SELECT suspendido_en IS NULL AS active FROM autenticacion.usuarios WHERE id = $1",
          [userId],
        );
        if (!user.rowCount) {
          await client.query("ROLLBACK");
          return { kind: "not_found" as const };
        }
        const existing = await client.query<{ role: "admin" | "support"; version: number }>(
          `SELECT rol AS role, version FROM autenticacion.roles_usuario
           WHERE usuario_id = $1 FOR UPDATE`,
          [userId],
        );
        const current = existing.rows[0];
        if ((current?.version ?? 0) !== version) {
          await client.query("ROLLBACK");
          return { kind: "version_conflict" as const };
        }
        if (userId === actorId && role !== "admin") {
          await client.query("ROLLBACK");
          return { kind: "self_change" as const };
        }
        if (current?.role === "admin" && role !== "admin" && user.rows[0]?.active) {
          const count = await client.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM autenticacion.roles_usuario r
             JOIN autenticacion.usuarios u ON u.id = r.usuario_id
             WHERE r.rol = 'admin' AND u.suspendido_en IS NULL`,
          );
          if (Number(count.rows[0]?.count ?? 0) <= 1) {
            await client.query("ROLLBACK");
            return { kind: "last_admin" as const };
          }
        }
        if (current?.role === role) {
          await client.query("COMMIT");
          return { kind: "unchanged" as const, version };
        }
        const action = current ? "role.changed" : "role.assigned";
        const nextVersion = version + 1;
        if (current) {
          await client.query(
            `UPDATE autenticacion.roles_usuario SET rol = $2, version = $3,
               asignado_en = now(), actualizado_en = now() WHERE usuario_id = $1`,
            [userId, role, nextVersion],
          );
        } else {
          await client.query(
            `INSERT INTO autenticacion.roles_usuario (usuario_id, rol)
             VALUES ($1,$2)`,
            [userId, role],
          );
        }
        await client.query(
          `INSERT INTO dominio.auditoria_admin (id, actor_id, accion, objetivo_id)
           VALUES ($1,$2,$3,$4)`,
          [crypto.randomUUID(), actorId, action, userId],
        );
        await client.query("COMMIT");
        return { kind: "saved" as const, version: nextVersion };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    async removeRole(actorId: string, userId: string, version: number) {
      if (actorId === userId) return { kind: "self_change" as const };
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('notesia-admin-roles'))");
        const existing = await client.query<{
          role: "admin" | "support";
          version: number;
          active: boolean;
        }>(
          `SELECT r.rol AS role, r.version, u.suspendido_en IS NULL AS active
           FROM autenticacion.roles_usuario r
           JOIN autenticacion.usuarios u ON u.id = r.usuario_id
           WHERE r.usuario_id = $1 FOR UPDATE OF r`,
          [userId],
        );
        const current = existing.rows[0];
        if (!current) {
          await client.query("ROLLBACK");
          return { kind: "not_found" as const };
        }
        if (current.version !== version) {
          await client.query("ROLLBACK");
          return { kind: "version_conflict" as const };
        }
        if (current.role === "admin" && current.active) {
          const count = await client.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM autenticacion.roles_usuario r
             JOIN autenticacion.usuarios u ON u.id = r.usuario_id
             WHERE r.rol = 'admin' AND u.suspendido_en IS NULL`,
          );
          if (Number(count.rows[0]?.count ?? 0) <= 1) {
            await client.query("ROLLBACK");
            return { kind: "last_admin" as const };
          }
        }
        await client.query("DELETE FROM autenticacion.roles_usuario WHERE usuario_id = $1", [
          userId,
        ]);
        await client.query(
          `INSERT INTO dominio.auditoria_admin (id, actor_id, accion, objetivo_id)
           VALUES ($1,$2,'role.removed',$3)`,
          [crypto.randomUUID(), actorId, userId],
        );
        await client.query("COMMIT");
        return { kind: "removed" as const };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

export type AdminRepository = ReturnType<typeof createAdminRepository>;
