import type { Pool } from "pg";

/** Mensajes del estudiante por sesión; al llegar, hay que empezar otra. */
export const ASSISTANT_SESSION_LIMIT = 30;

export type AssistantActionState = "pending" | "applied" | "dismissed" | "failed";
export type AssistantSessionEntry = {
  id: string;
  role: "user" | "assistant";
  text: string;
  actions?: Array<{ id: string; action: unknown; state: AssistantActionState }>;
  at: string;
};
export type AssistantSession = {
  id: string;
  content: AssistantSessionEntry[];
  userMessages: number;
};

const columns = `id, contenido AS content, mensajes_usuario AS "userMessages"`;

/**
 * Conversaciones del asistente guardadas en el servidor (no en el teléfono).
 * Una sola activa por estudiante; las cerradas no se vuelven a mostrar.
 */
export function createAssistantSessionRepository(pool: Pool) {
  return {
    /** La sesión activa; si no hay, se crea vacía. */
    async active(userId: string) {
      await pool.query(
        `INSERT INTO dominio.sesiones_asistente (id, usuario_id) VALUES ($1, $2)
         ON CONFLICT (usuario_id) WHERE estado = 'active' DO NOTHING`,
        [crypto.randomUUID(), userId],
      );
      const result = await pool.query<AssistantSession>(
        `SELECT ${columns} FROM dominio.sesiones_asistente
         WHERE usuario_id = $1 AND estado = 'active'`,
        [userId],
      );
      const session = result.rows[0];
      if (!session) throw new Error("Active assistant session is missing");
      return session;
    },
    /**
     * Agrega un turno (mensaje del estudiante y respuesta) a la sesión, si sigue
     * activa y no llegó al límite. Devuelve cuántos mensajes lleva, o null.
     */
    async appendTurn(userId: string, sessionId: string, entries: AssistantSessionEntry[]) {
      const result = await pool.query<{ userMessages: number }>(
        `UPDATE dominio.sesiones_asistente
         SET contenido = contenido || $3::jsonb, mensajes_usuario = mensajes_usuario + 1,
           actualizado_en = now()
         WHERE id = $1 AND usuario_id = $2 AND estado = 'active' AND mensajes_usuario < $4
         RETURNING mensajes_usuario AS "userMessages"`,
        [sessionId, userId, JSON.stringify(entries), ASSISTANT_SESSION_LIMIT],
      );
      return result.rows[0]?.userMessages ?? null;
    },
    /** Cierra la sesión activa (queda en el servidor) y abre una nueva vacía. */
    async startNew(userId: string) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `UPDATE dominio.sesiones_asistente SET estado = 'closed', cerrada_en = now()
           WHERE usuario_id = $1 AND estado = 'active'`,
          [userId],
        );
        const created = await client.query<AssistantSession>(
          `INSERT INTO dominio.sesiones_asistente (id, usuario_id) VALUES ($1, $2)
           RETURNING ${columns}`,
          [crypto.randomUUID(), userId],
        );
        await client.query("COMMIT");
        const session = created.rows[0];
        if (!session) throw new Error("Assistant session was not created");
        return session;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    /** Registra qué hizo el estudiante con una propuesta (confirmarla, descartarla…). */
    async setActionState(userId: string, actionId: string, state: AssistantActionState) {
      const result = await pool.query(
        `UPDATE dominio.sesiones_asistente s SET contenido = (
           SELECT jsonb_agg(
             CASE WHEN jsonb_array_length(coalesce(m->'actions', '[]'::jsonb)) > 0
               THEN jsonb_set(m, '{actions}', (
                 SELECT jsonb_agg(CASE WHEN a->>'id' = $2
                   THEN jsonb_set(a, '{state}', to_jsonb($3::text)) ELSE a END ORDER BY i)
                 FROM jsonb_array_elements(m->'actions') WITH ORDINALITY AS x(a, i)))
               ELSE m END ORDER BY ord)
           FROM jsonb_array_elements(s.contenido) WITH ORDINALITY AS t(m, ord)
         ), actualizado_en = now()
         WHERE s.usuario_id = $1 AND s.estado = 'active'
           AND jsonb_path_exists(s.contenido, '$[*].actions[*] ? (@.id == $id)',
             jsonb_build_object('id', $2::text))`,
        [userId, actionId, state],
      );
      return (result.rowCount ?? 0) > 0;
    },
  };
}

export type AssistantSessionRepository = ReturnType<typeof createAssistantSessionRepository>;
