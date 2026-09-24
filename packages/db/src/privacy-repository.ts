import type { Pool, PoolClient } from "pg";

export type PrivacyType = "terms" | "privacy" | "ai";
export type PrivacyLanguage = "es" | "en";
export type PrivacyDecision = "accepted" | "revoked";

export type PrivacyDocument = {
  id: string;
  type: PrivacyType;
  version: number;
  language: PrivacyLanguage;
  content: string;
  publishedAt: Date;
};
export type ConsentRecord = {
  id: string;
  documentId: string;
  type: PrivacyType;
  version: number;
  language: PrivacyLanguage;
  decision: PrivacyDecision;
  recordedAt: Date;
};

const documentColumns = `id, tipo AS type, version, idioma AS language,
  contenido AS content, publicado_en AS "publishedAt"`;
const consentColumns = `c.id, c.documento_id AS "documentId", d.tipo AS type,
  d.version, d.idioma AS language, c.decision, c.registrado_en AS "recordedAt"`;

async function withUserLock<T>(
  pool: Pool,
  userId: string,
  work: (client: PoolClient) => Promise<T>,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`privacy:${userId}`]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function createPrivacyRepository(pool: Pool) {
  return {
    async published(language: PrivacyLanguage) {
      const result = await pool.query<PrivacyDocument>(
        `SELECT DISTINCT ON (tipo) ${documentColumns}
         FROM dominio.documentos_privacidad
         WHERE idioma = $1 AND publicado_en IS NOT NULL
         ORDER BY tipo, version DESC`,
        [language],
      );
      return result.rows;
    },
    async currentConsents(userId: string) {
      const result = await pool.query<ConsentRecord>(
        `SELECT DISTINCT ON (d.tipo) ${consentColumns}
         FROM dominio.consentimientos c
         JOIN dominio.documentos_privacidad d ON d.id = c.documento_id
         WHERE c.usuario_id = $1
         ORDER BY d.tipo, c.orden DESC`,
        [userId],
      );
      return result.rows;
    },
    async accept(userId: string, documentId: string) {
      return withUserLock(pool, userId, async (client) => {
        const current = await client.query<PrivacyDocument>(
          `SELECT ${documentColumns} FROM dominio.documentos_privacidad d
           WHERE d.id = $1 AND d.publicado_en IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM dominio.documentos_privacidad newer
               WHERE newer.tipo = d.tipo AND newer.idioma = d.idioma
                 AND newer.publicado_en IS NOT NULL AND newer.version > d.version
             )`,
          [documentId],
        );
        const document = current.rows[0];
        if (!document) return null;
        const previous = await client.query<ConsentRecord>(
          `SELECT ${consentColumns} FROM dominio.consentimientos c
           JOIN dominio.documentos_privacidad d ON d.id = c.documento_id
           WHERE c.usuario_id = $1 AND d.tipo = $2
           ORDER BY c.orden DESC LIMIT 1`,
          [userId, document.type],
        );
        if (previous.rows[0]?.decision === "accepted" && previous.rows[0].documentId === documentId)
          return previous.rows[0];
        const id = crypto.randomUUID();
        const inserted = await client.query<ConsentRecord>(
          `WITH inserted AS (
             INSERT INTO dominio.consentimientos (id, usuario_id, documento_id, decision)
             VALUES ($1, $2, $3, 'accepted') RETURNING *
           ) SELECT ${consentColumns} FROM inserted c
             JOIN dominio.documentos_privacidad d ON d.id = c.documento_id`,
          [id, userId, documentId],
        );
        return inserted.rows[0] ?? null;
      });
    },
    async revokeAi(userId: string) {
      return withUserLock(pool, userId, async (client) => {
        const previous = await client.query<ConsentRecord>(
          `SELECT ${consentColumns} FROM dominio.consentimientos c
           JOIN dominio.documentos_privacidad d ON d.id = c.documento_id
           WHERE c.usuario_id = $1 AND d.tipo = 'ai'
           ORDER BY c.orden DESC LIMIT 1`,
          [userId],
        );
        if (previous.rows[0]?.decision !== "accepted") return previous.rows[0] ?? null;
        const inserted = await client.query<ConsentRecord>(
          `WITH inserted AS (
             INSERT INTO dominio.consentimientos (id, usuario_id, documento_id, decision)
             VALUES ($1, $2, $3, 'revoked') RETURNING *
           ) SELECT ${consentColumns} FROM inserted c
             JOIN dominio.documentos_privacidad d ON d.id = c.documento_id`,
          [crypto.randomUUID(), userId, previous.rows[0].documentId],
        );
        return inserted.rows[0] ?? null;
      });
    },
  };
}

export type PrivacyRepository = ReturnType<typeof createPrivacyRepository>;
