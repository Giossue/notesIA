import type { ActivitySeriesCreate } from "@notesia/contracts";
import type { Pool } from "pg";

type RecurrenceOccurrence = { occursOn: string; startAfterAt: string; deadlineAt: string };

type Series = ActivitySeriesCreate & {
  timeZone: string;
  instanceCount: number;
  createdAt: Date;
  sortOrder: string;
};

const columns = `id, orden::text AS "sortOrder", materia_id AS "subjectId", tipo AS kind, titulo AS title,
  descripcion AS description, prioridad AS priority,
  minutos_estimados AS "estimatedMinutes", frecuencia AS frequency,
  inicia_el::text AS "startOn", hasta_el::text AS "throughOn",
  zona_horaria AS "timeZone", cantidad_instancias AS "instanceCount",
  creado_en AS "createdAt"`;

function matches(row: Series, input: ActivitySeriesCreate) {
  return (
    row.id === input.id &&
    row.subjectId === input.subjectId &&
    row.kind === input.kind &&
    row.title === input.title &&
    row.description === input.description &&
    row.priority === input.priority &&
    row.estimatedMinutes === input.estimatedMinutes &&
    row.frequency === input.frequency &&
    row.startOn === input.startOn &&
    row.throughOn === input.throughOn
  );
}

export function createActivitySeriesRepository(pool: Pool) {
  return {
    async get(userId: string, id: string) {
      const result = await pool.query<Series>(
        `select ${columns} from dominio.series_actividades where usuario_id = $1 and id = $2`,
        [userId, id],
      );
      return result.rows[0] ?? null;
    },

    async list(userId: string, cursor: string | null) {
      const result = await pool.query<Series>(
        `select ${columns} from dominio.series_actividades
         where usuario_id = $1 and ($2::bigint is null or orden < $2::bigint)
         order by orden desc limit 21`,
        [userId, cursor],
      );
      return result.rows;
    },

    async create(
      userId: string,
      input: ActivitySeriesCreate,
      timeZone: string,
      occurrences: RecurrenceOccurrence[],
    ) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const existing = await client.query<Series>(
          `select ${columns} from dominio.series_actividades where usuario_id = $1 and id = $2`,
          [userId, input.id],
        );
        if (existing.rows[0]) {
          await client.query("COMMIT");
          return matches(existing.rows[0], input)
            ? { kind: "replayed" as const, row: existing.rows[0] }
            : { kind: "conflict" as const };
        }

        if (input.subjectId) {
          const subject = await client.query(
            `select 1 from dominio.materias where usuario_id = $1 and id = $2
             and archivado_en is null and eliminado_en is null for share`,
            [userId, input.subjectId],
          );
          if (!subject.rowCount) {
            await client.query("ROLLBACK");
            return { kind: "subject_not_found" as const };
          }
        }

        const inserted = await client.query<Series>(
          `insert into dominio.series_actividades
           (id, usuario_id, materia_id, tipo, titulo, descripcion, prioridad,
            minutos_estimados, frecuencia, inicia_el, hasta_el, zona_horaria, cantidad_instancias)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           on conflict do nothing returning ${columns}`,
          [
            input.id,
            userId,
            input.subjectId,
            input.kind,
            input.title,
            input.description,
            input.priority,
            input.estimatedMinutes,
            input.frequency,
            input.startOn,
            input.throughOn,
            timeZone,
            occurrences.length,
          ],
        );
        if (!inserted.rows[0]) {
          const raced = await client.query<Series>(
            `select ${columns} from dominio.series_actividades where usuario_id = $1 and id = $2`,
            [userId, input.id],
          );
          await client.query("COMMIT");
          return raced.rows[0] && matches(raced.rows[0], input)
            ? { kind: "replayed" as const, row: raced.rows[0] }
            : { kind: "conflict" as const };
        }

        const generated = await client.query(
          `insert into dominio.actividades
           (id, usuario_id, serie_id, ocurre_el, materia_id, tipo, titulo, descripcion,
            prioridad, inicio_minimo, fecha_limite, minutos_estimados)
           select gen_random_uuid(), $1, $2, instance.occurred, $3, $4, $5, $6, $7,
             instance.starts_at, instance.ends_at, $8
           from unnest($9::date[], $10::timestamptz[], $11::timestamptz[])
             as instance(occurred, starts_at, ends_at)`,
          [
            userId,
            input.id,
            input.subjectId,
            input.kind,
            input.title,
            input.description,
            input.priority,
            input.estimatedMinutes,
            occurrences.map((row) => row.occursOn),
            occurrences.map((row) => row.startAfterAt),
            occurrences.map((row) => row.deadlineAt),
          ],
        );
        if (generated.rowCount !== occurrences.length)
          throw new Error("Activity series generation count mismatch");
        await client.query("COMMIT");
        return { kind: "created" as const, row: inserted.rows[0] };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

export type ActivitySeriesRepository = ReturnType<typeof createActivitySeriesRepository>;
