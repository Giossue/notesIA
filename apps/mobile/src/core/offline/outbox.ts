import { problemSchema } from "@notesia/contracts";
import { z } from "zod";
import { getSessionCookie, getSessionScope } from "@/core/auth/session-storage";
import { getApiBaseUrl } from "@/core/config/api";
import { utf8ByteLength } from "./bytes";
import { localDatabase } from "./database";
import { classifySyncResponse, retryDelayMs } from "./sync-policy";

const maxMutations = 100;
const maxBodyBytes = 64 * 1024;
const outboxRowSchema = z.object({
  id: z.string(),
  entity: z.string(),
  operation: z.string(),
  entity_id: z.string(),
  base_version: z.number().nullable(),
  method: z.enum(["DELETE", "PATCH", "POST", "PUT"]),
  path: z.string(),
  body_json: z.string().nullable(),
  idempotency_key: z.string().nullable(),
  created_at: z.string(),
  status: z.enum(["pending", "conflict", "failed"]),
  attempt_count: z.number(),
  next_attempt_at: z.string().nullable(),
  error_code: z.string().nullable(),
  error_title: z.string().nullable(),
});

export type QueuedMutation = z.infer<typeof outboxRowSchema>;
export type QueueMetadata = {
  id: string;
  entity: "activity" | "progress" | "time_entry";
  operation: "create" | "update" | "delete";
  entityId: string;
  baseVersion?: number;
};

export async function enqueueMutation(
  metadata: QueueMetadata,
  request: {
    method: "DELETE" | "PATCH" | "POST" | "PUT";
    path: string;
    body?: unknown;
    idempotencyKey?: string;
  },
) {
  const scope = await getSessionScope();
  if (!scope) throw new Error("Inicia sesión antes de guardar cambios sin conexión.");
  const bodyJson = request.body === undefined ? null : JSON.stringify(request.body);
  if (bodyJson && utf8ByteLength(bodyJson) > maxBodyBytes)
    throw new Error("El cambio es demasiado grande para guardarlo sin conexión.");
  const database = await localDatabase();
  await database.transaction(async (transaction) => {
    const count = await transaction.execute(
      "SELECT count(*) AS count FROM mutation_outbox WHERE scope_id = ?",
      [scope],
    );
    if (Number(count.rows[0]?.count ?? 0) >= maxMutations)
      throw new Error("La cola sin conexión está llena. Sincroniza o descarta cambios pendientes.");
    await transaction.execute(
      `INSERT OR IGNORE INTO mutation_outbox(
         id, scope_id, entity, operation, entity_id, base_version, method, path,
         body_json, idempotency_key, created_at, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        metadata.id,
        scope,
        metadata.entity,
        metadata.operation,
        metadata.entityId,
        metadata.baseVersion ?? null,
        request.method,
        request.path,
        bodyJson,
        request.idempotencyKey ?? null,
        new Date().toISOString(),
      ],
    );
  });
}

export async function listQueuedMutations() {
  const scope = await getSessionScope();
  if (!scope) return [];
  const database = await localDatabase();
  const result = await database.execute(
    `SELECT id, entity, operation, entity_id, base_version, method, path, body_json,
            idempotency_key, created_at, status, attempt_count, next_attempt_at,
            error_code, error_title
     FROM mutation_outbox WHERE scope_id = ? ORDER BY created_at ASC`,
    [scope],
  );
  return result.rows.map((row) => outboxRowSchema.parse(row));
}

export async function discardQueuedMutation(id: string) {
  const scope = await getSessionScope();
  if (!scope) return;
  const database = await localDatabase();
  await database.execute("DELETE FROM mutation_outbox WHERE id = ? AND scope_id = ?", [id, scope]);
}

export async function retryQueuedMutation(id: string) {
  const scope = await getSessionScope();
  if (!scope) return;
  const database = await localDatabase();
  await database.execute(
    `UPDATE mutation_outbox SET status = 'pending', next_attempt_at = NULL,
       error_code = NULL, error_title = NULL WHERE id = ? AND scope_id = ?`,
    [id, scope],
  );
}

async function recordRetry(item: QueuedMutation, code: string | null, title: string | null) {
  const database = await localDatabase();
  const nextAttempt = new Date(Date.now() + retryDelayMs(item.attempt_count + 1)).toISOString();
  await database.execute(
    `UPDATE mutation_outbox SET attempt_count = attempt_count + 1,
       next_attempt_at = ?, error_code = ?, error_title = ? WHERE id = ?`,
    [nextAttempt, code, title, item.id],
  );
}

export async function syncOutbox() {
  const [cookie, scope] = await Promise.all([getSessionCookie(), getSessionScope()]);
  if (!cookie || !scope) return { synced: 0, unresolved: 0 };
  const items = await listQueuedMutations();
  let synced = 0;
  for (const item of items) {
    if (item.status !== "pending") continue;
    if (item.next_attempt_at && Date.parse(item.next_attempt_at) > Date.now()) continue;
    let response: Response;
    try {
      response = await fetch(`${getApiBaseUrl()}${item.path}`, {
        method: item.method,
        headers: {
          Accept: "application/json",
          Cookie: cookie,
          ...(item.body_json ? { "Content-Type": "application/json" } : {}),
          ...(item.idempotency_key ? { "Idempotency-Key": item.idempotency_key } : {}),
        },
        body: item.body_json ?? undefined,
      });
    } catch {
      await recordRetry(item, "NETWORK_ERROR", "Sin conexión con el servidor.");
      break;
    }
    const disposition = classifySyncResponse(response.status);
    if (disposition === "success") {
      await discardQueuedMutation(item.id);
      synced += 1;
      continue;
    }
    if (disposition === "auth") break;
    const payload = await response.json().catch(() => null);
    const problem = problemSchema.safeParse(payload);
    const code = problem.success ? problem.data.code : `HTTP_${response.status}`;
    const title = problem.success ? problem.data.title : "No se pudo sincronizar el cambio.";
    if (disposition === "retry") {
      await recordRetry(item, code, title);
      continue;
    }
    const database = await localDatabase();
    await database.execute(
      `UPDATE mutation_outbox SET status = ?, attempt_count = attempt_count + 1,
       error_code = ?, error_title = ? WHERE id = ?`,
      [disposition, code, title, item.id],
    );
  }
  return { synced, unresolved: (await listQueuedMutations()).length };
}
