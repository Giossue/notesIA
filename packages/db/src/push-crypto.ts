import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function createPushTokenCipher(encodedKey: string) {
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32 || key.toString("base64") !== encodedKey)
    throw new Error("PUSH_ENCRYPTION_KEY must be canonical base64 for 32 bytes");
  const aad = (userId: string, deviceId: string) =>
    Buffer.from(`notesia-push-v1:${userId}:${deviceId}`);
  return {
    encrypt(userId: string, deviceId: string, token: string) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, nonce);
      cipher.setAAD(aad(userId, deviceId));
      const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
      return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]);
    },
    decrypt(userId: string, deviceId: string, encrypted: Buffer) {
      if (encrypted.length < 29) throw new Error("Invalid encrypted push token");
      const decipher = createDecipheriv("aes-256-gcm", key, encrypted.subarray(0, 12));
      decipher.setAAD(aad(userId, deviceId));
      decipher.setAuthTag(encrypted.subarray(12, 28));
      return Buffer.concat([decipher.update(encrypted.subarray(28)), decipher.final()]).toString(
        "utf8",
      );
    },
  };
}
export type PushTokenCipher = ReturnType<typeof createPushTokenCipher>;
