import { getSessionScope } from "@/core/auth/session-storage";
import { utf8ByteLength } from "./bytes";
import { localDatabase } from "./database";

const maxCacheEntries = 100;
const maxPayloadBytes = 512 * 1024;

async function scopeId() {
  return (await getSessionScope()) ?? "public";
}

export async function readApiCache(key: string) {
  const database = await localDatabase();
  const result = await database.execute(
    "SELECT payload_json FROM api_cache WHERE scope_id = ? AND cache_key = ?",
    [await scopeId(), key],
  );
  const payload = result.rows[0]?.payload_json;
  return typeof payload === "string" ? payload : null;
}

export async function writeApiCache(key: string, value: unknown) {
  const payload = JSON.stringify(value);
  if (utf8ByteLength(payload) > maxPayloadBytes) return;
  const database = await localDatabase();
  const scope = await scopeId();
  await database.transaction(async (transaction) => {
    await transaction.execute(
      `INSERT INTO api_cache(scope_id, cache_key, payload_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(scope_id, cache_key) DO UPDATE
       SET payload_json = excluded.payload_json, updated_at = excluded.updated_at`,
      [scope, key, payload, new Date().toISOString()],
    );
    await transaction.execute(
      `DELETE FROM api_cache
       WHERE scope_id = ? AND cache_key NOT IN (
         SELECT cache_key FROM api_cache WHERE scope_id = ?
         ORDER BY updated_at DESC LIMIT ?
       )`,
      [scope, scope, maxCacheEntries],
    );
  });
}
