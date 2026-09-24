import type { Pool, PoolClient } from "pg";

type RuleFields = { weekday: number; startMinute: number; endMinute: number };
type Window = { startMinute: number; endMinute: number };
type RuleRow = {
  id: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  version: number;
  archivedAt: Date | null;
  updatedAt: Date;
};
type ExceptionRow = { date: string; version: number; updatedAt: Date; windows: Window[] };

const ruleColumns = `id, dia_semana AS "weekday", minuto_inicio AS "startMinute",
  minuto_fin AS "endMinute", version, archivado_en AS "archivedAt",
  actualizado_en AS "updatedAt"`;

async function loadException(client: Pool | PoolClient, userId: string, date: string) {
  const row = await client.query<{ date: string; version: number; updatedAt: Date }>(
    `select fecha::text AS date, version, actualizado_en AS "updatedAt"
     from dominio.excepciones_disponibilidad where usuario_id = $1 and fecha = $2`,
    [userId, date],
  );
  if (!row.rows[0]) return null;
  const windows = await client.query<Window>(
    `select minuto_inicio AS "startMinute", minuto_fin AS "endMinute"
     from dominio.ventanas_excepcion where usuario_id = $1 and fecha = $2 order by posicion`,
    [userId, date],
  );
  return { ...row.rows[0], windows: windows.rows };
}

export function createAvailabilityRepository(pool: Pool) {
  return {
    async listRules(userId: string) {
      const result = await pool.query<RuleRow>(
        `select ${ruleColumns} from dominio.reglas_disponibilidad
         where usuario_id = $1 order by dia_semana, minuto_inicio, id`,
        [userId],
      );
      return result.rows;
    },
    async getRule(userId: string, id: string) {
      const result = await pool.query<RuleRow>(
        `select ${ruleColumns} from dominio.reglas_disponibilidad where usuario_id = $1 and id = $2`,
        [userId, id],
      );
      return result.rows[0] ?? null;
    },
    async createRule(userId: string, id: string, fields: RuleFields) {
      const result = await pool.query<RuleRow>(
        `insert into dominio.reglas_disponibilidad
         (id, usuario_id, dia_semana, minuto_inicio, minuto_fin) values ($1,$2,$3,$4,$5)
         on conflict do nothing returning ${ruleColumns}`,
        [id, userId, fields.weekday, fields.startMinute, fields.endMinute],
      );
      if (result.rows[0]) return { kind: "created" as const, row: result.rows[0] };
      const existing = await this.getRule(userId, id);
      if (
        existing &&
        !existing.archivedAt &&
        existing.weekday === fields.weekday &&
        existing.startMinute === fields.startMinute &&
        existing.endMinute === fields.endMinute
      ) {
        return { kind: "replayed" as const, row: existing };
      }
      return { kind: "conflict" as const };
    },
    async updateRule(userId: string, id: string, fields: RuleFields & { version: number }) {
      const result = await pool.query<RuleRow>(
        `update dominio.reglas_disponibilidad set dia_semana = $4, minuto_inicio = $5,
         minuto_fin = $6, version = version + 1, actualizado_en = now()
         where usuario_id = $1 and id = $2 and version = $3 and archivado_en is null
         returning ${ruleColumns}`,
        [userId, id, fields.version, fields.weekday, fields.startMinute, fields.endMinute],
      );
      return result.rows[0] ?? null;
    },
    async archiveRule(userId: string, id: string, version: number, archived: boolean) {
      const result = await pool.query<RuleRow>(
        `update dominio.reglas_disponibilidad set archivado_en = case when $4 then now() else null end,
         version = version + 1, actualizado_en = now()
         where usuario_id = $1 and id = $2 and version = $3
           and (($4 and archivado_en is null) or (not $4 and archivado_en is not null))
         returning ${ruleColumns}`,
        [userId, id, version, archived],
      );
      return result.rows[0] ?? null;
    },
    async listExceptions(userId: string, from: string, through: string) {
      const result = await pool.query<{ date: string }>(
        `select fecha::text AS date from dominio.excepciones_disponibilidad
         where usuario_id = $1 and fecha >= $2 and fecha < $3 order by fecha`,
        [userId, from, through],
      );
      const items: ExceptionRow[] = [];
      for (const row of result.rows) {
        const item = await loadException(pool, userId, row.date);
        if (item) items.push(item);
      }
      return items;
    },
    async getException(userId: string, date: string) {
      return loadException(pool, userId, date);
    },
    async replaceException(
      userId: string,
      date: string,
      version: number | null,
      windows: Window[],
    ) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        if (version === null) {
          const inserted = await client.query(
            `insert into dominio.excepciones_disponibilidad (usuario_id, fecha)
             values ($1,$2) on conflict do nothing returning fecha`,
            [userId, date],
          );
          if (!inserted.rowCount) {
            await client.query("ROLLBACK");
            return null;
          }
        } else {
          const updated = await client.query(
            `update dominio.excepciones_disponibilidad set version = version + 1,
             actualizado_en = now() where usuario_id = $1 and fecha = $2 and version = $3
             returning fecha`,
            [userId, date, version],
          );
          if (!updated.rowCount) {
            await client.query("ROLLBACK");
            return null;
          }
          await client.query(
            `delete from dominio.ventanas_excepcion where usuario_id = $1 and fecha = $2`,
            [userId, date],
          );
        }
        for (const [position, window] of windows.entries()) {
          await client.query(
            `insert into dominio.ventanas_excepcion
             (usuario_id, fecha, posicion, minuto_inicio, minuto_fin) values ($1,$2,$3,$4,$5)`,
            [userId, date, position, window.startMinute, window.endMinute],
          );
        }
        const row = await loadException(client, userId, date);
        await client.query("COMMIT");
        return row;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

export type AvailabilityRepository = ReturnType<typeof createAvailabilityRepository>;
