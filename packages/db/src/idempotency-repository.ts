import type { Pool } from "pg";

type Claim = { userId: string; key: string; method: string; path: string; hash: string };
type Stored = {
  method: string;
  path: string;
  hash: string;
  status: number | null;
  body: unknown;
  contentType: string | null;
};

export function createIdempotencyRepository(pool: Pool) {
  return {
    async claim(input: Claim) {
      const leaseId = crypto.randomUUID();
      await pool.query(
        `delete from dominio.claves_idempotencia
         where usuario_id = $1 and clave = $2 and expira_en < now()`,
        [input.userId, input.key],
      );
      const inserted = await pool.query(
        `insert into dominio.claves_idempotencia
         (usuario_id, clave, metodo, ruta, hash_peticion,
          propietario_arrendamiento, arrendado_hasta)
         values ($1,$2,$3,$4,$5,$6,now() + interval '2 minutes')
         on conflict do nothing returning clave`,
        [input.userId, input.key, input.method, input.path, input.hash, leaseId],
      );
      if (inserted.rowCount) return { kind: "claimed" as const, leaseId };
      const existing = await pool.query<Stored>(
        `select metodo AS method, ruta AS path, hash_peticion AS hash,
         estado_respuesta AS status, cuerpo_respuesta AS body,
         tipo_contenido AS "contentType"
         from dominio.claves_idempotencia
         where usuario_id = $1 and clave = $2`,
        [input.userId, input.key],
      );
      const row = existing.rows[0];
      if (!row || row.method !== input.method || row.path !== input.path || row.hash !== input.hash)
        return { kind: "conflict" as const };
      if (row.status === null) {
        const recovered = await pool.query(
          `UPDATE dominio.claves_idempotencia
           SET propietario_arrendamiento = $3,
             arrendado_hasta = now() + interval '2 minutes'
           WHERE usuario_id = $1 AND clave = $2 AND estado_respuesta IS NULL
             AND arrendado_hasta <= now() RETURNING clave`,
          [input.userId, input.key, leaseId],
        );
        return recovered.rowCount
          ? { kind: "claimed" as const, leaseId }
          : { kind: "pending" as const };
      }
      return {
        kind: "replayed" as const,
        status: row.status,
        body: row.body,
        contentType: row.contentType,
      };
    },
    async renew(input: Claim, leaseId: string) {
      const result = await pool.query(
        `UPDATE dominio.claves_idempotencia
         SET arrendado_hasta = now() + interval '2 minutes'
         WHERE usuario_id = $1 AND clave = $2 AND propietario_arrendamiento = $3
           AND estado_respuesta IS NULL`,
        [input.userId, input.key, leaseId],
      );
      return result.rowCount === 1;
    },
    async complete(
      input: Claim,
      leaseId: string,
      status: number,
      body: unknown,
      contentType: string,
    ) {
      const result = await pool.query(
        `update dominio.claves_idempotencia
         set estado_respuesta = $7, cuerpo_respuesta = $8::jsonb, tipo_contenido = $9,
           propietario_arrendamiento = NULL, arrendado_hasta = NULL
         where usuario_id = $1 and clave = $2 and metodo = $3 and ruta = $4
           and hash_peticion = $5 and propietario_arrendamiento = $6
           and estado_respuesta is null`,
        [
          input.userId,
          input.key,
          input.method,
          input.path,
          input.hash,
          leaseId,
          status,
          JSON.stringify(body),
          contentType,
        ],
      );
      if (!result.rowCount) throw new Error("Idempotency claim was lost");
    },
    async release(input: Claim, leaseId: string) {
      await pool.query(
        `delete from dominio.claves_idempotencia
         where usuario_id = $1 and clave = $2 and hash_peticion = $3
           and propietario_arrendamiento = $4 and estado_respuesta is null`,
        [input.userId, input.key, input.hash, leaseId],
      );
    },
    async purgeExpired(limit = 500) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
        throw new Error("Invalid idempotency cleanup limit");
      const result = await pool.query(
        `WITH expired AS (
           SELECT usuario_id, clave FROM dominio.claves_idempotencia
           WHERE expira_en <= now()
           ORDER BY expira_en, usuario_id, clave LIMIT $1 FOR UPDATE SKIP LOCKED
         )
         DELETE FROM dominio.claves_idempotencia keys
         USING expired WHERE keys.usuario_id = expired.usuario_id AND keys.clave = expired.clave`,
        [limit],
      );
      return result.rowCount ?? 0;
    },
  };
}
export type IdempotencyRepository = ReturnType<typeof createIdempotencyRepository>;
