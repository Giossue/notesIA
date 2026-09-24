import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEncryptedLocalBackup, verifyEncryptedLocalRestore } from "./local-backup";

const directory = await mkdtemp(join(tmpdir(), "notesia-backup-test-"));
const filePath = join(directory, "database.enc");
const key = randomBytes(32).toString("base64");
try {
  await createEncryptedLocalBackup(filePath, key);
  try {
    await verifyEncryptedLocalRestore(filePath, randomBytes(32).toString("base64"));
    throw new Error("Wrong backup key was accepted");
  } catch (error) {
    if ((error as Error).message === "Wrong backup key was accepted") throw error;
  }
  const result = await verifyEncryptedLocalRestore(filePath, key);
  console.log(
    `Encrypted local backup restored in isolation: ${result.migrations} migrations, ${result.tables} tables`,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
