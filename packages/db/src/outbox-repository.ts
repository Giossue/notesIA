import { tracePropagation, withTraceSpan } from "@notesia/observability";
import type { Pool } from "pg";
import { queuePushForNotification } from "./push-device-repository";

type OutboxRow = {
  id: string;
  userId: string;
  eventType: "plan.applied";
  planId: string;
  attempts: number;
  traceId: string | null;
  sourceSpanId: string | null;
};

export function createOutboxRepository(pool: Pool) {
  return {
    async processOne() {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query<OutboxRow>(
          `select id::text, usuario_id AS "userId", tipo_evento AS "eventType",
           plan_id AS "planId", intentos AS attempts, traza_id AS "traceId",
           span_origen_id AS "sourceSpanId"
           from dominio.bandeja_salida
           where estado = 'pending' and disponible_en <= now()
           order by disponible_en, id for update skip locked limit 1`,
        );
        const row = result.rows[0];
        if (!row) {
          await client.query("COMMIT");
          return { kind: "empty" as const };
        }
        return await withTraceSpan(
          {
            name: "worker.outbox",
            component: "worker",
            parent: tracePropagation(row.traceId, row.sourceSpanId),
          },
          async () => {
            await client.query("SAVEPOINT delivery");
            try {
              if (row.eventType !== "plan.applied") throw new Error("Unsupported outbox event");
              const notification = await client.query<{ id: string }>(
                `with enabled as (
                   select usuario_id from dominio.preferencias_usuario
                   where usuario_id = $2 and notificaciones_habilitadas
                   for share
                 )
                 insert into dominio.notificaciones
                 (id, usuario_id, evento_salida_id, tipo, plan_id)
                 select $1,$2,$3,'plan_applied',$4
                 from enabled
                 on conflict (evento_salida_id) do nothing returning id`,
                [crypto.randomUUID(), row.userId, row.id, row.planId],
              );
              if (notification.rows[0])
                await queuePushForNotification(client, row.userId, notification.rows[0].id);
              await client.query(
                `update dominio.bandeja_salida set estado = 'done', procesado_en = now()
                 where id = $1`,
                [row.id],
              );
              await client.query("COMMIT");
              return { kind: "delivered" as const };
            } catch {
              await client.query("ROLLBACK TO SAVEPOINT delivery");
              await client.query(
                `update dominio.bandeja_salida
                 set intentos = intentos + 1,
                   estado = case when intentos + 1 >= 10 then 'dead' else 'pending' end,
                   disponible_en = now() + least(interval '1 hour',
                     power(2, least(intentos, 10)) * interval '5 seconds')
                 where id = $1`,
                [row.id],
              );
              await client.query("COMMIT");
              return { kind: "retry_scheduled" as const };
            }
          },
        );
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
export type OutboxRepository = ReturnType<typeof createOutboxRepository>;
