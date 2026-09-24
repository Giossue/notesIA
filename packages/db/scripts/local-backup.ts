import { spawn } from "node:child_process";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { open, unlink } from "node:fs/promises";
import { Client } from "pg";

const host = "127.0.0.1";
const port = 5432;
const database = "notesia_dev";
const user = "postgres";
const magic = Buffer.from("NOTESIA-PGDUMP-GCM-1\n");

function decodeKey(encoded: string): Buffer {
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded)
    throw new Error("BACKUP_ENCRYPTION_KEY must be canonical base64 for 32 bytes");
  return key;
}

async function verifyLocalDatabase() {
  const client = new Client({ host, port, user, database });
  try {
    await client.connect();
    const result = await client.query<{ db: string; localHost: boolean; serverPort: number }>(
      `SELECT current_database() AS db,
        inet_server_addr() = inet '127.0.0.1' AS "localHost",
        inet_server_port() AS "serverPort"`,
    );
    if (
      result.rows[0]?.db !== database ||
      result.rows[0].localHost !== true ||
      result.rows[0].serverPort !== port
    )
      throw new Error("Backup requires local notesia_dev on 127.0.0.1:5432");
  } finally {
    await client.end();
  }
}

async function writeAll(handle: Awaited<ReturnType<typeof open>>, data: Buffer) {
  let offset = 0;
  while (offset < data.length) {
    const written = await handle.write(data, offset, data.length - offset);
    if (written.bytesWritten <= 0) throw new Error("Backup write failed");
    offset += written.bytesWritten;
  }
}

function waitProcess(child: ReturnType<typeof spawn>): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? -1));
  });
}

export async function createEncryptedLocalBackup(filePath: string, encodedKey: string) {
  const key = decodeKey(encodedKey);
  await verifyLocalDatabase();
  const handle = await open(filePath, "wx", 0o600);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(magic);
  const child = spawn(
    "pg_dump",
    ["-Fc", "--no-owner", "--no-acl", "-h", host, "-p", String(port), "-U", user, "-d", database],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  child.stderr.resume();
  const completed = waitProcess(child);
  try {
    await writeAll(handle, Buffer.concat([magic, nonce]));
    if (!child.stdout) throw new Error("pg_dump did not expose stdout");
    for await (const chunk of child.stdout)
      await writeAll(handle, cipher.update(Buffer.from(chunk)));
    if ((await completed) !== 0) throw new Error("pg_dump failed");
    await writeAll(handle, cipher.final());
    await writeAll(handle, cipher.getAuthTag());
    await handle.sync();
  } catch (error) {
    child.kill();
    await handle.close();
    await unlink(filePath).catch(() => {});
    throw error;
  }
  await handle.close();
}

async function decryptBackup(
  filePath: string,
  key: Buffer,
  consume: (chunk: Buffer) => Promise<void>,
) {
  const handle = await open(filePath, "r");
  try {
    const stat = await handle.stat();
    if (stat.size < magic.length + 12 + 16 + 1) throw new Error("Invalid backup");
    const header = Buffer.alloc(magic.length + 12);
    await handle.read(header, 0, header.length, 0);
    if (!header.subarray(0, magic.length).equals(magic)) throw new Error("Invalid backup format");
    const tag = Buffer.alloc(16);
    await handle.read(tag, 0, 16, stat.size - 16);
    const decipher = createDecipheriv("aes-256-gcm", key, header.subarray(magic.length));
    decipher.setAAD(magic);
    decipher.setAuthTag(tag);
    const stream = createReadStream(filePath, {
      start: header.length,
      end: stat.size - 17,
    });
    for await (const chunk of stream) await consume(decipher.update(Buffer.from(chunk)));
    await consume(decipher.final());
  } finally {
    await handle.close();
  }
}

export async function verifyEncryptedLocalRestore(filePath: string, encodedKey: string) {
  const key = decodeKey(encodedKey);
  await verifyLocalDatabase();
  await decryptBackup(filePath, key, async () => {});
  const admin = new Client({ host, port, user, database: "postgres" });
  const restoredName = `notesia_restore_test_${crypto.randomUUID().replaceAll("-", "")}`;
  let created = false;
  try {
    await admin.connect();
    const target = await admin.query<{ db: string; localHost: boolean; serverPort: number }>(
      `SELECT current_database() AS db,
        inet_server_addr() = inet '127.0.0.1' AS "localHost",
        inet_server_port() AS "serverPort"`,
    );
    if (
      target.rows[0]?.db !== "postgres" ||
      target.rows[0].localHost !== true ||
      target.rows[0].serverPort !== port
    )
      throw new Error("Restore verification requires local PostgreSQL");
    await admin.query(`CREATE DATABASE "${restoredName}"`);
    created = true;
    const child = spawn(
      "pg_restore",
      [
        "--no-owner",
        "--no-acl",
        "--exit-on-error",
        "--single-transaction",
        "-h",
        host,
        "-p",
        String(port),
        "-U",
        user,
        "-d",
        restoredName,
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    child.stderr.resume();
    const completed = waitProcess(child);
    try {
      if (!child.stdin) throw new Error("pg_restore did not expose stdin");
      await decryptBackup(filePath, key, async (chunk) => {
        if (chunk.length && !child.stdin?.write(chunk))
          await once(child.stdin as NodeJS.WritableStream, "drain");
      });
      child.stdin.end();
      if ((await completed) !== 0) throw new Error("pg_restore failed");
    } catch (error) {
      child.kill();
      throw error;
    }
    const restored = new Client({ host, port, user, database: restoredName });
    try {
      await restored.connect();
      const check = await restored.query<{ migrations: number; tables: number }>(
        `SELECT (SELECT count(*)::integer FROM public.migraciones) AS migrations,
          (SELECT count(*)::integer FROM information_schema.tables
           WHERE table_schema IN ('autenticacion', 'dominio')) AS tables`,
      );
      const row = check.rows[0];
      if (!row || row.migrations < 24 || row.tables < 10)
        throw new Error("Restored database is incomplete");
      return row;
    } finally {
      await restored.end();
    }
  } finally {
    if (created) await admin.query(`DROP DATABASE "${restoredName}" WITH (FORCE)`);
    await admin.end();
  }
}
