import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const NONCE_BYTES = 12;
const TAG_BYTES = 16;

type Purpose = "notesia-recovery-mail-v1" | "notesia-verification-mail-v1";

function associatedData(id: string, userId: string) {
  return Buffer.from(`${id}:${userId}`);
}

export function createAuthMailCipher(secret: string, purpose: Purpose) {
  const key = Buffer.from(
    hkdfSync("sha256", Buffer.from(secret), Buffer.from(purpose), Buffer.from("encryption"), 32),
  );
  return {
    encrypt(id: string, userId: string, value: string) {
      const nonce = randomBytes(NONCE_BYTES);
      const cipher = createCipheriv("aes-256-gcm", key, nonce);
      cipher.setAAD(associatedData(id, userId));
      const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
      return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]);
    },
    decrypt(id: string, userId: string, payload: Buffer) {
      if (payload.length < NONCE_BYTES + TAG_BYTES) throw new Error("Invalid auth mail payload");
      const nonce = payload.subarray(0, NONCE_BYTES);
      const tag = payload.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES);
      const decipher = createDecipheriv("aes-256-gcm", key, nonce);
      decipher.setAAD(associatedData(id, userId));
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(payload.subarray(NONCE_BYTES + TAG_BYTES)),
        decipher.final(),
      ]).toString("utf8");
    },
  };
}
