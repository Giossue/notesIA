import type { Pool } from "pg";

export type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  recipientId: string | null;
  recipientEmail: string | null;
  recipients: number;
  authorEmail: string | null;
  createdAt: Date;
  cursorCreatedAt: string;
};
export type AnnouncementInput = {
  id: string;
  title: string;
  body: string;
  /** Correo del estudiante; null para enviarlo a todos. */
  recipientEmail: string | null;
};

const columns = `an.id, an.titulo AS title, an.cuerpo AS body,
  an.destinatario_id AS "recipientId", target.correo AS "recipientEmail",
  an.destinatarios AS recipients, author.correo AS "authorEmail", an.creado_en AS "createdAt",
  to_char(an.creado_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorCreatedAt"`;
const joins = `LEFT JOIN autenticacion.usuarios target ON target.id = an.destinatario_id
  LEFT JOIN autenticacion.usuarios author ON author.id = an.autor_id`;

/**
 * Avisos escritos desde el panel. Cada anuncio crea la notificación de cada
 * destinatario y encola su push en la misma transacción, como los avisos
 * automáticos: queda en el historial de la app aunque el push no llegue.
 */
export function createAnnouncementRepository(pool: Pool) {
  const get = async (id: string) => {
    const result = await pool.query<AnnouncementRow>(
      `SELECT ${columns} FROM dominio.anuncios an ${joins} WHERE an.id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  };
  return {
    async list(cursor: { createdAt: string; id: string } | null) {
      const result = await pool.query<AnnouncementRow>(
        `SELECT ${columns} FROM dominio.anuncios an ${joins}
         WHERE ($1::timestamptz IS NULL OR (an.creado_en, an.id) < ($1, $2::uuid))
         ORDER BY an.creado_en DESC, an.id DESC LIMIT 21`,
        [cursor?.createdAt ?? null, cursor?.id ?? null],
      );
      return result.rows;
    },
    async send(actorId: string, input: AnnouncementInput) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Mismo id: es un reintento del mismo envío.
        const existing = await client.query<{ title: string; body: string }>(
          `SELECT titulo AS title, cuerpo AS body FROM dominio.anuncios WHERE id = $1`,
          [input.id],
        );
        if (existing.rows[0]) {
          await client.query("ROLLBACK");
          const same =
            existing.rows[0].title === input.title && existing.rows[0].body === input.body;
          return same
            ? { kind: "sent" as const, row: (await get(input.id)) as AnnouncementRow }
            : { kind: "conflict" as const };
        }
        let recipientId: string | null = null;
        if (input.recipientEmail) {
          const target = await client.query<{ id: string }>(
            `SELECT u.id FROM autenticacion.usuarios u
             JOIN dominio.perfiles_usuario p ON p.usuario_id = u.id
             WHERE lower(u.correo) = lower($1)`,
            [input.recipientEmail],
          );
          if (!target.rows[0]) {
            await client.query("ROLLBACK");
            return { kind: "recipient_not_found" as const };
          }
          recipientId = target.rows[0].id;
        }
        await client.query(
          `INSERT INTO dominio.anuncios (id, autor_id, titulo, cuerpo, destinatario_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [input.id, actorId, input.title, input.body, recipientId],
        );
        // A todos: solo estudiantes activos (sin rol de equipo ni suspendidos).
        // Se respeta si el estudiante apagó los avisos; el "No molestar" lo
        // aplica el envío del push, que lo pospone.
        const created = await client.query<{ created: number }>(
          `WITH recipients AS (
             SELECT prefs.usuario_id FROM dominio.preferencias_usuario prefs
             JOIN autenticacion.usuarios u ON u.id = prefs.usuario_id
             JOIN dominio.perfiles_usuario p ON p.usuario_id = prefs.usuario_id
             WHERE prefs.notificaciones_habilitadas
               AND ($2::uuid IS NOT NULL AND prefs.usuario_id = $2 OR $2::uuid IS NULL
                 AND u.suspendido_en IS NULL
                 AND NOT EXISTS (SELECT 1 FROM autenticacion.roles_usuario r
                   WHERE r.usuario_id = u.id))
           ), created AS (
             INSERT INTO dominio.notificaciones (id, usuario_id, tipo, anuncio_id, creada_en)
             SELECT gen_random_uuid(), usuario_id, 'announcement', $1, now() FROM recipients
             ON CONFLICT DO NOTHING
             RETURNING id, usuario_id
           ), queued AS (
             INSERT INTO dominio.envios_push (id, usuario_id, dispositivo_id, notificacion_id)
             SELECT gen_random_uuid(), d.usuario_id, d.id, created.id
             FROM created JOIN dominio.dispositivos_push d ON d.usuario_id = created.usuario_id
             JOIN dominio.preferencias_usuario prefs ON prefs.usuario_id = d.usuario_id
             WHERE prefs.push_habilitado AND d.actualizado_en >= now() - interval '30 days'
             ON CONFLICT (notificacion_id, dispositivo_id) DO NOTHING
           )
           SELECT count(*)::integer AS created FROM created`,
          [input.id, recipientId],
        );
        await client.query(`UPDATE dominio.anuncios SET destinatarios = $2 WHERE id = $1`, [
          input.id,
          created.rows[0]?.created ?? 0,
        ]);
        await client.query(
          `INSERT INTO dominio.auditoria_admin (id, actor_id, accion, objetivo_id)
           VALUES ($1, $2, 'announcement.sent', $3)`,
          [crypto.randomUUID(), actorId, input.id],
        );
        await client.query("COMMIT");
        return { kind: "sent" as const, row: (await get(input.id)) as AnnouncementRow };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
export type AnnouncementRepository = ReturnType<typeof createAnnouncementRepository>;
