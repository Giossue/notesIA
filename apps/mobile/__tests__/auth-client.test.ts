import { getCurrentUser, sessionCookieFromHeader, signIn, signOut } from "@/core/auth/auth-client";

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

test("does not accept a similarly named cookie", () => {
  expect(sessionCookieFromHeader("fake-better-auth.session_token=bad; Path=/")).toBeNull();
});
