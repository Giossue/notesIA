import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { AiProvider } from "./adapters";

export function createAiKeyCipher(encodedKey: string) {
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32 || key.toString("base64") !== encodedKey)
    throw new Error("AI_ENCRYPTION_KEY must be a canonical base64-encoded 32-byte key");
  return {
    encrypt(provider: AiProvider, apiKey: string): Buffer {
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, nonce);
      cipher.setAAD(Buffer.from(`notesia-ai-key-v1:${provider}`));
      const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
      return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]);
    },
    decrypt(provider: AiProvider, value: Buffer): string {
      if (value.length < 29) throw new Error("Invalid encrypted AI key");
      const decipher = createDecipheriv("aes-256-gcm", key, value.subarray(0, 12));
      decipher.setAAD(Buffer.from(`notesia-ai-key-v1:${provider}`));
      decipher.setAuthTag(value.subarray(12, 28));
      return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString(
        "utf8",
      );
    },
  };
}

export type AiKeyCipher = ReturnType<typeof createAiKeyCipher>;
