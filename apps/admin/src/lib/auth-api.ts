import {
  authSessionSchema,
  authSignInResultSchema,
  twoFactorEnableResultSchema,
} from "@notesia/contracts";
import { z } from "zod";
import { apiRequest } from "./api";

const successSchema = z.unknown();

export type AuthSession = NonNullable<z.infer<typeof authSessionSchema>>;
export type TwoFactorSetup = z.infer<typeof twoFactorEnableResultSchema>;

export const authApi = {
  session: () => apiRequest("/v1/auth/get-session", authSessionSchema),
  signIn: (email: string, password: string) =>
    apiRequest("/v1/auth/sign-in/email", authSignInResultSchema, {
      method: "POST",
      body: { email, password },
    }),
  signOut: () => apiRequest("/v1/auth/sign-out", successSchema, { method: "POST" }),
  enableTwoFactor: (password: string) =>
    apiRequest("/v1/auth/two-factor/enable", twoFactorEnableResultSchema, {
      method: "POST",
      body: { password, method: "totp" },
    }),
  verifyTotp: (code: string) =>
    apiRequest("/v1/auth/two-factor/verify-totp", successSchema, {
      method: "POST",
      body: { code, trustDevice: false },
    }),
  verifyBackupCode: (code: string) =>
    apiRequest("/v1/auth/two-factor/verify-backup-code", successSchema, {
      method: "POST",
      body: { code, trustDevice: false },
    }),
  resetPassword: (token: string, newPassword: string) =>
    apiRequest("/v1/auth/reset-password", successSchema, {
      method: "POST",
      body: { token, newPassword },
    }),
};
