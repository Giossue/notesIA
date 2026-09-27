import type { Pool, PoolClient } from "pg";

export type AssistantSuggestionRow = {
  id: string;
  text: string;
  active: boolean;
  version: number;
  updatedAt: Date;
};

const columns = `id, texto AS text, activa AS active, version, actualizado_en AS "updatedAt"`;

async function audit(client: PoolClient, actorId: string, action: string, targetId: string) {
  await client.query(
    `INSERT INTO dominio.auditoria_admin (id, actor_id, accion, objetivo_id) VALUES ($1,$2,$3,$4)`,
    [crypto.randomUUID(), actorId, action, targetId],
  );
}

function isUniqueViolation(error: unknown) {
  return (error as { code?: string } | null)?.code === "23505";
}

/** Sugerencias del chat del asistente: el panel las gestiona y la app muestra 3 al azar. */
export function createAssistantSuggestionRepository(pool: Pool) {
  const inTransaction = async <T>(work: (client: PoolClient) => Promise<T>) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };

  return {
    async random(count: number) {
      const result = await pool.query<{ text: string }>(
        `SELECT texto AS text FROM dominio.sugerencias_asistente
         WHERE activa ORDER BY random() LIMIT $1`,
        [count],
      );
      return result.rows.map((row) => row.text);
    },
    async list() {
      const result = await pool.query<AssistantSuggestionRow>(
        `SELECT ${columns} FROM dominio.sugerencias_asistente ORDER BY orden, creado_en, texto`,
      );
      return result.rows;
    },
    async create(actorId: string, input: { text: string; active: boolean }) {
      try {
        return await inTransaction(async (client) => {
          const created = await client.query<AssistantSuggestionRow>(
            `INSERT INTO dominio.sugerencias_asistente (texto, activa, orden)
             VALUES ($1, $2, (SELECT coalesce(max(orden), 0) + 1 FROM dominio.sugerencias_asistente))
             RETURNING ${columns}`,
            [input.text, input.active],
          );
          const row = created.rows[0] as AssistantSuggestionRow;
          await audit(client, actorId, "assistant_suggestion.created", row.id);
          return { kind: "created" as const, row };
        });
      } catch (error) {
        if (isUniqueViolation(error)) return { kind: "duplicate" as const };
        throw error;
      }
    },
    async update(
      actorId: string,
      id: string,
      input: { text: string; active: boolean; version: number },
    ) {
      try {
        return await inTransaction(async (client) => {
          const updated = await client.query<AssistantSuggestionRow>(
            `UPDATE dominio.sugerencias_asistente
             SET texto = $2, activa = $3, version = version + 1, actualizado_en = now()
             WHERE id = $1 AND version = $4 RETURNING ${columns}`,
            [id, input.text, input.active, input.version],
          );
          const row = updated.rows[0];
          if (!row) {
            const exists = await client.query(
              "SELECT 1 FROM dominio.sugerencias_asistente WHERE id = $1",
              [id],
            );
            if (exists.rowCount) return { kind: "version_conflict" as const };
            return { kind: "not_found" as const };
          }
          await audit(client, actorId, "assistant_suggestion.updated", id);
          return { kind: "updated" as const, row };
        });
      } catch (error) {
        if (isUniqueViolation(error)) return { kind: "duplicate" as const };
        throw error;
      }
    },
    async remove(actorId: string, id: string) {
      return inTransaction(async (client) => {
        const removed = await client.query(
          "DELETE FROM dominio.sugerencias_asistente WHERE id = $1",
          [id],
        );
        if (!removed.rowCount) return false;
        await audit(client, actorId, "assistant_suggestion.deleted", id);
        return true;
      });
    },
  };
}

export type AssistantSuggestionRepository = ReturnType<typeof createAssistantSuggestionRepository>;
