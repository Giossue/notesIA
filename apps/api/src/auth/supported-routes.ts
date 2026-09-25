// Only these Better Auth operations are part of the product's HTTP contract.
// In particular, profile changes and account deletion go through versioned API routes.
export const supportedAuthRoutes = [
  { method: "GET", path: "/v1/auth/get-session" },
  { method: "POST", path: "/v1/auth/sign-up/email" },
  { method: "POST", path: "/v1/auth/sign-in/email" },
  { method: "POST", path: "/v1/auth/sign-out" },
  { method: "POST", path: "/v1/auth/send-verification-email" },
  { method: "GET", path: "/v1/auth/verify-email" },
  { method: "POST", path: "/v1/auth/request-password-reset" },
  { method: "POST", path: "/v1/auth/reset-password" },
  { method: "POST", path: "/v1/auth/two-factor/enable" },
  { method: "POST", path: "/v1/auth/two-factor/disable" },
  { method: "POST", path: "/v1/auth/two-factor/verify-totp" },
  { method: "POST", path: "/v1/auth/two-factor/verify-backup-code" },
  { method: "POST", path: "/v1/auth/two-factor/generate-backup-codes" },
] as const;
