import { existsSync, readFileSync } from "node:fs";

const secretNames = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "AI_ENCRYPTION_KEY",
  "PUSH_ENCRYPTION_KEY",
  "SMTP_PASSWORD",
  "ACCOUNT_DELETION_AUDIT_KEY",
] as const;
const requiredBundles = ["dist/api/index.js", "dist/worker/index.js"];
const optionalBundles = ["dist/mobile/index.android.bundle"];

for (const file of requiredBundles)
  if (!existsSync(file)) throw new Error(`Missing build artifact: ${file}`);

const bundles = [...requiredBundles, ...optionalBundles.filter(existsSync)].map((file) => ({
  file,
  contents: readFileSync(file, "utf8"),
}));
let checked = 0;
for (const name of secretNames) {
  const value = process.env[name];
  if (!value) continue;
  if (value.length < 12) throw new Error(`${name} is too short for a reliable bundle scan`);
  checked++;
  for (const bundle of bundles)
    if (bundle.contents.includes(value))
      throw new Error(`${name} appears in ${bundle.file}; remove the embedded secret`);
}
if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET)
  throw new Error("DATABASE_URL and BETTER_AUTH_SECRET are required for the bundle check");
console.log(`Checked ${checked} configured sensitive values across ${bundles.length} bundles`);
