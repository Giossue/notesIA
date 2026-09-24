import type { Pool } from "pg";

type Fields = { name: string; startsOn: string; endsOn: string };
type Period = Fields & {
  id: string;
  sortOrder: string;
  version: number;
  archivedAt: Date | null;
  updatedAt: Date;
};
const columns = `id, orden::text AS "sortOrder", nombre AS name, inicia_el::text AS "startsOn",
  termina_el::text AS "endsOn", version, archivado_en AS "archivedAt",
  actualizado_en AS "updatedAt"`;

export function createAcademicPeriodRepository(pool: Pool) {
  return {
    async get(userId: string, id: string) {
      const result = await pool.query<Period>(
        `select ${columns} from dominio.periodos_academicos where usuario_id = $1 and id = $2`,
        [userId, id],
      );
      return result.rows[0] ?? null;
    },
    async list(userId: string, archived: boolean, cursor: string | null) {
      const result = await pool.query<Period>(
        `select ${columns} from dominio.periodos_academicos
         where usuario_id = $1 and ($2::boolean = (archivado_en is not null))
           and ($3::bigint is null or orden < $3::bigint)
         order by orden desc limit 21`,
        [userId, archived, cursor],
      );
      return result.rows;
    },
    async create(userId: string, id: string, fields: Fields) {
      const result = await pool.query<Period>(
        `insert into dominio.periodos_academicos (id, usuario_id, nombre, inicia_el, termina_el)
         values ($1,$2,$3,$4,$5) on conflict do nothing returning ${columns}`,
        [id, userId, fields.name, fields.startsOn, fields.endsOn],
      );
      if (result.rows[0]) return { kind: "created" as const, row: result.rows[0] };
      const existing = await this.get(userId, id);
      if (
        existing &&
        !existing.archivedAt &&
        existing.name === fields.name &&
        existing.startsOn === fields.startsOn &&
        existing.endsOn === fields.endsOn
      )
        return { kind: "replayed" as const, row: existing };
      return { kind: "conflict" as const };
    },
    async update(userId: string, id: string, fields: Fields & { version: number }) {
      const result = await pool.query<Period>(
        `update dominio.periodos_academicos set nombre = $4, inicia_el = $5,
           termina_el = $6, version = version + 1, actualizado_en = now()
         where usuario_id = $1 and id = $2 and version = $3 and archivado_en is null
         returning ${columns}`,
        [userId, id, fields.version, fields.name, fields.startsOn, fields.endsOn],
      );
      return result.rows[0] ?? null;
    },
    async archive(userId: string, id: string, version: number, archived: boolean) {
      const result = await pool.query<Period>(
        `update dominio.periodos_academicos set archivado_en = case when $4 then now() else null end,
           version = version + 1, actualizado_en = now()
         where usuario_id = $1 and id = $2 and version = $3
           and (($4 and archivado_en is null) or (not $4 and archivado_en is not null))
         returning ${columns}`,
        [userId, id, version, archived],
      );
      return result.rows[0] ?? null;
    },
  };
}
export type AcademicPeriodRepository = ReturnType<typeof createAcademicPeriodRepository>;
