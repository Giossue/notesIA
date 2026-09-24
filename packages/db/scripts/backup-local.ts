import { createEncryptedLocalBackup } from "./local-backup";

const filePath = process.argv[2];
const key = process.env.BACKUP_ENCRYPTION_KEY;
if (!filePath || !key)
  throw new Error("Usage: BACKUP_ENCRYPTION_KEY=... bun backup-local.ts /secure/path/backup.enc");
await createEncryptedLocalBackup(filePath, key);
console.log("Encrypted local backup created");
