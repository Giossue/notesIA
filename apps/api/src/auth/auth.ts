import { readAdminOrigin, readAuthMailConfig } from "@notesia/config";
import { createAuth } from "./create-auth";

const databaseUrl = process.env.DATABASE_URL;
const secret = process.env.BETTER_AUTH_SECRET;

if (!databaseUrl || !secret) {
  throw new Error("DATABASE_URL and BETTER_AUTH_SECRET are required");
}

const mailConfig = readAuthMailConfig(process.env);
const baseURL = process.env.BETTER_AUTH_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`;
if (process.env.NODE_ENV === "production" && new URL(baseURL).protocol !== "https:")
  throw new Error("BETTER_AUTH_URL must use HTTPS in production");
export const adminOrigin = readAdminOrigin(process.env, baseURL);

export const { auth, getSession, handler, pool } = createAuth({
  databaseUrl,
  secret,
  baseURL,
  trustedOrigins: [adminOrigin],
  allowSignUp: process.env.ALLOW_SIGNUP === "true",
  recovery: mailConfig?.resetUrl ? { resetUrl: mailConfig.resetUrl } : undefined,
  verificationMail: mailConfig ? {} : undefined,
});
