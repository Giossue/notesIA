import {
  AuthenticationError,
  emailVerificationCallbackResult,
  getCurrentUser,
  isEmailVerificationRequired,
  resendVerificationEmail,
  sessionCookieFromHeader,
  signIn,
  signOut,
  signUp,
} from "@/core/auth/auth-client";

let mockCookie: string | null = null;
jest.mock("@/core/auth/session-storage", () => ({
  getSessionCookie: jest.fn(async () => mockCookie),
  setSessionCookie: jest.fn(async (cookie: string) => {
    mockCookie = cookie;
  }),
  clearSessionCookie: jest.fn(async () => {
    mockCookie = null;
  }),
}));

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  mockCookie = null;
});

test("keeps only the Better Auth session cookie and restores the user", async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      headers: {
        get: () =>
          "other=ignored; Path=/, better-auth.session_token=signed.value; Path=/; HttpOnly",
      },
    })
    .mockResolvedValueOnce({
      ok: true,
      headers: { get: () => null },
      json: async () => ({ user: { id: "user-1", name: "Ana", email: "ana@example.test" } }),
    })
    .mockResolvedValueOnce({ ok: true, headers: { get: () => null } });

  await signIn("ana@example.test", "correct-password");
  expect(mockCookie).toBe("better-auth.session_token=signed.value");
  expect(await getCurrentUser()).toEqual({ id: "user-1", name: "Ana", email: "ana@example.test" });
  expect((global.fetch as jest.Mock).mock.calls[1][1].headers.Cookie).toBe(mockCookie);
  await signOut();
  expect(mockCookie).toBeNull();
});

test("rejects a successful response without a Better Auth cookie", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, headers: { get: () => null } });
  await expect(signIn("ana@example.test", "correct-password")).rejects.toThrow(
    "No se pudo guardar la sesión de forma segura.",
  );
  expect(mockCookie).toBeNull();
});

test("clears an expired session and returns to authentication", async () => {
  mockCookie = "better-auth.session_token=expired";
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 401,
    headers: { get: () => null },
    clone: () => ({ json: async () => ({ code: "AUTH_REQUIRED" }) }),
  });

  await expect(getCurrentUser()).resolves.toBeNull();
  expect(mockCookie).toBeNull();
});

test("does not accept a similarly named cookie", () => {
  expect(sessionCookieFromHeader("fake-better-auth.session_token=bad; Path=/")).toBeNull();
});

test("registers a pending account without creating a session", async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => null },
    json: async () => ({
      token: null,
      user: { id: "user-1", email: "ana@example.test", emailVerified: false },
    }),
  });

  await expect(
    signUp("Ana", "ana@example.test", "a-secure-password", "avatar-coffee-cup"),
  ).resolves.toEqual({
    email: "ana@example.test",
  });
  expect(mockCookie).toBeNull();
});

test("identifies the fixed email verification callback", () => {
  expect(emailVerificationCallbackResult("notesia://email-verified")).toEqual({
    kind: "verified",
  });
  expect(emailVerificationCallbackResult("notesia://email-verified?error=invalid_token")).toEqual({
    kind: "error",
    code: "invalid_token",
  });
  expect(emailVerificationCallbackResult("notesia://another-route")).toBeNull();
});

test("surfaces an unverified account and requests another generic email", async () => {
  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({
      ok: false,
      status: 403,
      headers: { get: () => null },
      clone: () => ({ json: async () => ({ code: "EMAIL_NOT_VERIFIED" }) }),
    })
    .mockResolvedValueOnce({ ok: true, headers: { get: () => null } });

  let failure: unknown;
  try {
    await signIn("ana@example.test", "a-secure-password");
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(AuthenticationError);
  expect(isEmailVerificationRequired(failure)).toBe(true);
  expect((failure as Error).message).toBe("Verifica tu correo antes de iniciar sesión.");

  await resendVerificationEmail("ana@example.test");
  const request = (global.fetch as jest.Mock).mock.calls[1];
  expect(request[0]).toContain("/auth/send-verification-email");
  expect(JSON.parse(request[1].body)).toEqual({ email: "ana@example.test" });
});
