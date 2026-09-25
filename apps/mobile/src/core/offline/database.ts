import type { DB } from "@op-engineering/op-sqlite";
import * as Keychain from "react-native-keychain";
import { v4 as uuidv4 } from "uuid";

const databaseKeyService = "ec.notesia.planner.local-database-key";
let databasePromise: Promise<DB> | null = null;

async function databaseKey() {
  const stored = await Keychain.getGenericPassword({
    service: databaseKeyService,
  });
  if (stored) return stored.password;
  const key = `${uuidv4()}${uuidv4()}`;
  await Keychain.setGenericPassword("database", key, {
    service: databaseKeyService,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return key;
}

async function createDatabase() {
  const [{ open }, encryptionKey] = await Promise.all([
    import("@op-engineering/op-sqlite"),
    databaseKey(),
  ]);
  const database = open({ name: "notesia-local.sqlite", encryptionKey });
  await database.execute("PRAGMA foreign_keys = ON");
  await database.execute("PRAGMA journal_mode = WAL");
  await database.executeBatch([
    [
      `CREATE TABLE IF NOT EXISTS api_cache (
         scope_id TEXT NOT NULL,
         cache_key TEXT NOT NULL,
         payload_json TEXT NOT NULL,
         updated_at TEXT NOT NULL,
         PRIMARY KEY (scope_id, cache_key)
       ) STRICT`,
    ],
    [
      `CREATE TABLE IF NOT EXISTS mutation_outbox (
         id TEXT PRIMARY KEY,
         scope_id TEXT NOT NULL,
         entity TEXT NOT NULL,
         operation TEXT NOT NULL,
         entity_id TEXT NOT NULL,
         base_version INTEGER,
         method TEXT NOT NULL,
         path TEXT NOT NULL,
         body_json TEXT,
         idempotency_key TEXT,
         created_at TEXT NOT NULL,
         status TEXT NOT NULL CHECK (status IN ('pending', 'conflict', 'failed')),
         attempt_count INTEGER NOT NULL DEFAULT 0,
         next_attempt_at TEXT,
         error_code TEXT,
         error_title TEXT
       ) STRICT`,
    ],
    [
      "CREATE INDEX IF NOT EXISTS mutation_outbox_ready ON mutation_outbox(scope_id, status, next_attempt_at, created_at)",
    ],
    [
      "CREATE UNIQUE INDEX IF NOT EXISTS mutation_outbox_dedupe ON mutation_outbox(scope_id, method, path, body_json)",
    ],
  ]);
  return database;
}

export function localDatabase() {
  databasePromise ??= createDatabase();
  return databasePromise;
}

export async function clearLocalPrivateData() {
  const database = await localDatabase();
  await database.executeBatch([["DELETE FROM api_cache"], ["DELETE FROM mutation_outbox"]]);
}
