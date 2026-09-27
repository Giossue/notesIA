import type { Pool } from "pg";

export type ReportType = "bug" | "suggestion" | "account" | "other";
export type ReportStatus = "new" | "in_review" | "resolved" | "closed";
export type ReportContext = {
  platform: string | null;
  osVersion: string | null;
  appVersion: string | null;
};
export type ReportRow = {
  id: string;
  userId: string;
  type: ReportType;
  title: string;
  description: string;
  context: ReportContext;
  status: ReportStatus;
  assigneeId: string | null;
  reply: string | null;
  repliedAt: Date | null;
  closedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};
export type AdminReportRow = ReportRow & {
  userEmail: string;
  userName: string;
  assigneeEmail: string | null;
  cursorCreatedAt: string;
};

const columns = `r.id, r.usuario_id AS "userId", r.tipo AS type, r.titulo AS title,
  r.descripcion AS description, r.contexto AS context, r.estado AS status,
  r.asignado_a AS "assigneeId", r.respuesta AS reply, r.respondido_en AS "repliedAt",
  r.cerrado_en AS "closedAt", r.version, r.creado_en AS "createdAt",
  r.actualizado_en AS "updatedAt"`;
const adminColumns = `${columns}, u.correo AS "userEmail", u.nombre AS "userName",
  assignee.correo AS "assigneeEmail",
  to_char(r.creado_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorCreatedAt"`;
const adminJoins = `FROM dominio.reportes r
  JOIN autenticacion.usuarios u ON u.id = r.usuario_id
  LEFT JOIN autenticacion.usuarios assignee ON assignee.id = r.asignado_a`;

export function createReportRepository(pool: Pool) {
  return {
    /** Crea el reporte; repetir la solicitud con el mismo id devuelve el mismo reporte. */
    async create(
      userId: string,
      input: {
        id: string;
        type: ReportType;
        title: string;
        description: string;
        context: ReportContext;
      },
    ) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO dominio.reportes (id, usuario_id, tipo, titulo, descripcion, contexto)
           VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING RETURNING id`,
          [input.id, userId, input.type, input.title, input.description, input.context],
        );
        if (inserted.rowCount)
          await client.query(
            `INSERT INTO dominio.historial_reportes (id, reporte_id, actor_id, accion, registrado_en)
             VALUES ($1,$2,$3,'created', clock_timestamp())`,
            [crypto.randomUUID(), input.id, userId],
          );
        const row = await client.query<ReportRow>(
          `SELECT ${columns} FROM dominio.reportes r WHERE r.id = $1 AND r.usuario_id = $2`,
          [input.id, userId],
        );
        await client.query("COMMIT");
        return row.rows[0] ?? null;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    async listMine(userId: string) {
      const result = await pool.query<ReportRow>(
        `SELECT ${columns} FROM dominio.reportes r WHERE r.usuario_id = $1
         ORDER BY r.creado_en DESC LIMIT 100`,
        [userId],
      );
      return result.rows;
    },
    async adminList(status: ReportStatus | null, cursor: { createdAt: string; id: string } | null) {
      const result = await pool.query<AdminReportRow>(
        `SELECT ${adminColumns} ${adminJoins}
         WHERE ($1::text IS NULL OR r.estado = $1)
           AND ($2::timestamptz IS NULL OR (r.creado_en, r.id) < ($2, $3::uuid))
         ORDER BY r.creado_en DESC, r.id DESC LIMIT 21`,
        [status, cursor?.createdAt ?? null, cursor?.id ?? null],
      );
      return result.rows;
    },
    async adminGet(id: string) {
      const report = await pool.query<AdminReportRow>(
        `SELECT ${adminColumns} ${adminJoins} WHERE r.id = $1`,
        [id],
      );
      const row = report.rows[0];
      if (!row) return null;
      const history = await pool.query<{
        action: "created" | "assigned" | "status_changed" | "replied";
        actorEmail: string | null;
        detail: Record<string, unknown>;
        recordedAt: Date;
      }>(
        `SELECT h.accion AS action, actor.correo AS "actorEmail", h.detalle AS detail,
           h.registrado_en AS "recordedAt"
         FROM dominio.historial_reportes h
         LEFT JOIN autenticacion.usuarios actor ON actor.id = h.actor_id
         WHERE h.reporte_id = $1 ORDER BY h.registrado_en, h.id`,
        [id],
      );
      return { ...row, history: history.rows };
    },
    /**
     * Soporte asigna, cambia el estado o responde. Si responde o lo da por
     * resuelto o cerrado, el estudiante recibe un aviso (y push si lo tiene).
     */
    async adminUpdate(
      actorId: string,
      id: string,
      change: { version: number; status?: ReportStatus; assignToMe?: boolean; reply?: string },
    ) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const found = await client.query<{
          userId: string;
          status: ReportStatus;
          version: number;
          assigneeId: string | null;
        }>(
          `SELECT usuario_id AS "userId", estado AS status, version,
             asignado_a AS "assigneeId"
           FROM dominio.reportes WHERE id = $1 FOR UPDATE`,
          [id],
        );
        const current = found.rows[0];
        if (!current) {
          await client.query("ROLLBACK");
          return { kind: "not_found" as const };
        }
        if (current.version !== change.version) {
          await client.query("ROLLBACK");
          return { kind: "version_conflict" as const };
        }
        const history = async (action: string, detail: Record<string, unknown>) =>
          client.query(
            // clock_timestamp: dentro de la transacción conserva el orden de los pasos.
            `INSERT INTO dominio.historial_reportes
               (id, reporte_id, actor_id, accion, detalle, registrado_en)
             VALUES ($1,$2,$3,$4,$5, clock_timestamp())`,
            [crypto.randomUUID(), id, actorId, action, detail],
          );
        // Asignarse o responder un reporte nuevo lo pasa a "en revisión".
        const status =
          change.status ??
          (current.status === "new" && (change.assignToMe || change.reply)
            ? "in_review"
            : current.status);
        const assignee = change.assignToMe ? actorId : current.assigneeId;
        await client.query(
          `UPDATE dominio.reportes SET estado = $2, asignado_a = $3,
             respuesta = coalesce($4, respuesta),
             respondido_en = CASE WHEN $4::text IS NULL THEN respondido_en ELSE now() END,
             cerrado_en = CASE WHEN $2 IN ('resolved','closed')
               THEN coalesce(cerrado_en, now()) ELSE NULL END,
             version = version + 1, actualizado_en = now()
           WHERE id = $1`,
          [id, status, assignee, change.reply ?? null],
        );
        if (assignee !== current.assigneeId) await history("assigned", {});
        if (status !== current.status)
          await history("status_changed", { from: current.status, to: status });
        if (change.reply) await history("replied", { reply: change.reply });
        const notify =
          Boolean(change.reply) ||
          (status !== current.status && (status === "resolved" || status === "closed"));
        if (notify)
          await client.query(
            `WITH created AS (
               INSERT INTO dominio.notificaciones (id, usuario_id, tipo, reporte_id, creada_en)
               SELECT gen_random_uuid(), $1, 'report_updated', $2, now()
               FROM dominio.preferencias_usuario prefs
               WHERE prefs.usuario_id = $1 AND prefs.notificaciones_habilitadas
               RETURNING id, usuario_id
             )
             INSERT INTO dominio.envios_push (id, usuario_id, dispositivo_id, notificacion_id)
             SELECT gen_random_uuid(), d.usuario_id, d.id, created.id
             FROM created JOIN dominio.dispositivos_push d ON d.usuario_id = created.usuario_id
             JOIN dominio.preferencias_usuario prefs ON prefs.usuario_id = d.usuario_id
             WHERE prefs.push_habilitado AND d.actualizado_en >= now() - interval '30 days'
             ON CONFLICT (notificacion_id, dispositivo_id) DO NOTHING`,
            [current.userId, id],
          );
        await client.query("COMMIT");
        return { kind: "updated" as const };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

export type ReportRepository = ReturnType<typeof createReportRepository>;
