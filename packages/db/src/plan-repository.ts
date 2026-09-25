import { currentTracePropagation, withTraceSpan } from "@notesia/observability";
import type { Pool, PoolClient } from "pg";

type PlanHeader = {
  id: string;
  status: "draft" | "active" | "superseded" | "rejected";
  version: number;
  algorithmVersion: string;
  sourceRevision: string;
  basePlanId: string | null;
  from: string;
  through: string;
  minSessionMinutes: number;
  maxSessionMinutes: number;
  maxDailyMinutes: number;
  createdAt: Date;
  cursorCreatedAt: string;
  appliedAt: Date | null;
};
type PlanBlock = {
  id: string;
  activityId: string;
  startsAt: Date;
  endsAt: Date;
  isLocked: boolean;
};
type Unscheduled = { activityId: string; minutes: number; reason: string };
type Risk = {
  activityId: string;
  remainingMinutes: number;
  capacityMinutes: number;
  marginMinutes: number;
  level: string;
  reasons: string[];
};
type Draft = {
  id: string;
  algorithmVersion: string;
  sourceRevision: string;
  basePlanId: string | null;
  from: string;
  through: string;
  minSessionMinutes: number;
  maxSessionMinutes: number;
  maxDailyMinutes: number;
  blocks: PlanBlock[];
  unscheduled: Unscheduled[];
  risk: Risk[];
};

const headerColumns = `id, estado AS status, version, version_algoritmo AS "algorithmVersion",
  revision_origen::text AS "sourceRevision", plan_base_id AS "basePlanId",
  fecha_desde::text AS "from", fecha_hasta::text AS "through",
  sesion_minima AS "minSessionMinutes", sesion_maxima AS "maxSessionMinutes",
  maximo_diario AS "maxDailyMinutes", creado_en AS "createdAt",
  to_char(creado_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    AS "cursorCreatedAt", aplicado_en AS "appliedAt"`;

async function load(client: Pool | PoolClient, userId: string, id: string) {
  const plan = await client.query<PlanHeader>(
    `select ${headerColumns} from dominio.planes where usuario_id = $1 and id = $2`,
    [userId, id],
  );
  const header = plan.rows[0];
  if (!header) return null;
  const [blocks, unscheduled, risk] = await Promise.all([
    client.query<PlanBlock>(
      `select id, actividad_id AS "activityId", inicia_en AS "startsAt",
        termina_en AS "endsAt", bloqueado AS "isLocked"
       from dominio.bloques_plan where usuario_id = $1 and plan_id = $2
       order by inicia_en, id`,
      [userId, id],
    ),
    client.query<Unscheduled>(
      `select actividad_id AS "activityId", minutos AS minutes, razon AS reason
       from dominio.trabajo_no_asignado where usuario_id = $1 and plan_id = $2
       order by actividad_id`,
      [userId, id],
    ),
    client.query<Risk>(
      `select actividad_id AS "activityId", minutos_restantes AS "remainingMinutes",
       minutos_capacidad AS "capacityMinutes", minutos_margen AS "marginMinutes",
       nivel AS level, razones AS reasons from dominio.riesgos_plan
       where usuario_id = $1 and plan_id = $2 order by actividad_id`,
      [userId, id],
    ),
  ]);
  return { ...header, blocks: blocks.rows, unscheduled: unscheduled.rows, risk: risk.rows };
}

export function createPlanRepository(pool: Pool) {
  return {
    async getRevision(userId: string) {
      await pool.query(
        `insert into dominio.revisiones_planificacion (usuario_id) values ($1)
         on conflict do nothing`,
        [userId],
      );
      const result = await pool.query<{ revision: string }>(
        `select revision::text from dominio.revisiones_planificacion where usuario_id = $1`,
        [userId],
      );
      return result.rows[0]?.revision ?? "0";
    },
    async get(userId: string, id: string) {
      return load(pool, userId, id);
    },
    async getActive(userId: string) {
      const result = await pool.query<{ id: string }>(
        `select id from dominio.planes where usuario_id = $1 and estado = 'active'`,
        [userId],
      );
      return result.rows[0] ? load(pool, userId, result.rows[0].id) : null;
    },
    async createDraft(userId: string, draft: Draft) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `insert into dominio.planes
           (id, usuario_id, estado, version_algoritmo, revision_origen, plan_base_id,
            fecha_desde, fecha_hasta, sesion_minima, sesion_maxima, maximo_diario)
           values ($1,$2,'draft',$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            draft.id,
            userId,
            draft.algorithmVersion,
            draft.sourceRevision,
            draft.basePlanId,
            draft.from,
            draft.through,
            draft.minSessionMinutes,
            draft.maxSessionMinutes,
            draft.maxDailyMinutes,
          ],
        );
        for (const block of draft.blocks)
          await client.query(
            `insert into dominio.bloques_plan
           (id, usuario_id, plan_id, actividad_id, inicia_en, termina_en, bloqueado)
           values ($1,$2,$3,$4,$5,$6,$7)`,
            [
              block.id,
              userId,
              draft.id,
              block.activityId,
              block.startsAt,
              block.endsAt,
              block.isLocked,
            ],
          );
        for (const item of draft.unscheduled)
          await client.query(
            `insert into dominio.trabajo_no_asignado
           (usuario_id, plan_id, actividad_id, minutos, razon) values ($1,$2,$3,$4,$5)`,
            [userId, draft.id, item.activityId, item.minutes, item.reason],
          );
        for (const item of draft.risk)
          await client.query(
            `insert into dominio.riesgos_plan
           (usuario_id, plan_id, actividad_id, minutos_restantes, minutos_capacidad,
            minutos_margen, nivel, razones) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              userId,
              draft.id,
              item.activityId,
              item.remainingMinutes,
              item.capacityMinutes,
              item.marginMinutes,
              item.level,
              item.reasons,
            ],
          );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
      return this.get(userId, draft.id);
    },
    async changeBlock(
      userId: string,
      planId: string,
      blockId: string,
      version: number,
      changes: { startsAt: Date; endsAt: Date; isLocked: boolean } | null,
      summary: { unscheduled: Unscheduled[]; risk: Risk[] },
    ) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const revision = await client.query<{ revision: string }>(
          `select revision::text from dominio.revisiones_planificacion
           where usuario_id = $1 for update`,
          [userId],
        );
        const plan = await client.query<{
          version: number;
          status: string;
          sourceRevision: string;
        }>(
          `select version, estado AS status, revision_origen::text AS "sourceRevision" from dominio.planes
           where usuario_id = $1 and id = $2 for update`,
          [userId, planId],
        );
        if (plan.rows[0]?.status !== "draft" || plan.rows[0]?.version !== version) {
          await client.query("ROLLBACK");
          return null;
        }
        if (plan.rows[0].sourceRevision !== revision.rows[0]?.revision) {
          await client.query("ROLLBACK");
          return null;
        }
        const result = changes
          ? await client.query<PlanBlock>(
              `update dominio.bloques_plan set inicia_en = $4, termina_en = $5, bloqueado = $6
               where usuario_id = $1 and plan_id = $2 and id = $3 returning id`,
              [userId, planId, blockId, changes.startsAt, changes.endsAt, changes.isLocked],
            )
          : await client.query<PlanBlock>(
              `delete from dominio.bloques_plan
               where usuario_id = $1 and plan_id = $2 and id = $3 returning id`,
              [userId, planId, blockId],
            );
        if (!result.rows[0]) {
          await client.query("ROLLBACK");
          return null;
        }
        await client.query(
          `update dominio.planes set version = version + 1 where usuario_id = $1 and id = $2`,
          [userId, planId],
        );
        await client.query(
          `delete from dominio.trabajo_no_asignado where usuario_id = $1 and plan_id = $2`,
          [userId, planId],
        );
        await client.query(
          `delete from dominio.riesgos_plan where usuario_id = $1 and plan_id = $2`,
          [userId, planId],
        );
        for (const item of summary.unscheduled)
          await client.query(
            `insert into dominio.trabajo_no_asignado
           (usuario_id, plan_id, actividad_id, minutos, razon) values ($1,$2,$3,$4,$5)`,
            [userId, planId, item.activityId, item.minutes, item.reason],
          );
        for (const item of summary.risk)
          await client.query(
            `insert into dominio.riesgos_plan
           (usuario_id, plan_id, actividad_id, minutos_restantes, minutos_capacidad,
            minutos_margen, nivel, razones) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              userId,
              planId,
              item.activityId,
              item.remainingMinutes,
              item.capacityMinutes,
              item.marginMinutes,
              item.level,
              item.reasons,
            ],
          );
        await client.query("COMMIT");
        return this.get(userId, planId);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    async apply(userId: string, id: string, version: number) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `insert into dominio.revisiones_planificacion (usuario_id) values ($1)
           on conflict do nothing`,
          [userId],
        );
        const revision = await client.query<{ revision: string }>(
          `select revision::text from dominio.revisiones_planificacion
           where usuario_id = $1 for update`,
          [userId],
        );
        const plan = await client.query<PlanHeader>(
          `select ${headerColumns} from dominio.planes
           where usuario_id = $1 and id = $2 for update`,
          [userId, id],
        );
        const row = plan.rows[0];
        if (!row) {
          await client.query("ROLLBACK");
          return { kind: "not_found" as const };
        }
        if (row.status === "active" && row.version === version + 1) {
          await client.query("ROLLBACK");
          return { kind: "applied" as const, plan: await this.get(userId, id) };
        }
        if (row.status !== "draft" || row.version !== version) {
          await client.query("ROLLBACK");
          return { kind: "version_conflict" as const };
        }
        const active = await client.query<{ id: string }>(
          `select id from dominio.planes where usuario_id = $1 and estado = 'active' for update`,
          [userId],
        );
        if (
          row.sourceRevision !== revision.rows[0]?.revision ||
          row.basePlanId !== (active.rows[0]?.id ?? null)
        ) {
          await client.query("ROLLBACK");
          return { kind: "source_conflict" as const };
        }
        if (active.rows[0])
          await client.query(
            `update dominio.planes set estado = 'superseded' where usuario_id = $1 and id = $2`,
            [userId, active.rows[0].id],
          );
        await client.query(
          `update dominio.planes set estado = 'active', version = version + 1, aplicado_en = now()
           where usuario_id = $1 and id = $2`,
          [userId, id],
        );
        await withTraceSpan(
          { name: "db.outbox.enqueue", component: "database", target: "postgresql" },
          async () => {
            const trace = currentTracePropagation();
            await client.query(
              `insert into dominio.bandeja_salida
                 (usuario_id, tipo_evento, plan_id, traza_id, span_origen_id)
               values ($1,'plan.applied',$2,$3,$4) on conflict do nothing`,
              [userId, id, trace?.traceId ?? null, trace?.spanId ?? null],
            );
          },
        );
        await client.query("COMMIT");
        return { kind: "applied" as const, plan: await this.get(userId, id) };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    async reject(userId: string, id: string, version: number) {
      const result = await pool.query(
        `update dominio.planes set estado = 'rejected', version = version + 1
         where usuario_id = $1 and id = $2 and version = $3 and estado = 'draft'
         returning id`,
        [userId, id, version],
      );
      return Boolean(result.rowCount);
    },
    async history(userId: string, cursor: { createdAt: string; id: string } | null) {
      const result = await pool.query<PlanHeader>(
        `select ${headerColumns} from dominio.planes where usuario_id = $1
         and estado <> 'draft'
         and ($2::timestamptz is null or (creado_en, id) < ($2::timestamptz, $3::uuid))
         order by creado_en desc, id desc limit 21`,
        [userId, cursor?.createdAt ?? null, cursor?.id ?? null],
      );
      return result.rows;
    },
  };
}

export type PlanRepository = ReturnType<typeof createPlanRepository>;
