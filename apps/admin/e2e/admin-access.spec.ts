import { expect, test } from "@playwright/test";

const queue = { pending: 0, ready: 0, inFlight: 0, dead: 0, oldestReadyAt: null };
const health = {
  database: "ready",
  checkedAt: "2026-09-25T05:00:00.000Z",
  queues: {
    outbox: queue,
    push: queue,
    recoveryMail: queue,
    verificationMail: queue,
  },
  worker: { lastSeenAt: "2026-09-25T04:59:59.000Z", seenRecently: true },
  ai: { windowMinutes: 15, knownCostUsd: "0.000000000", uncostedRequests: 0, providers: [] },
  alerts: [],
};

test("an administrator can sign in, enroll TOTP and reach system health", async ({ page }) => {
  let signedIn = false;
  let mfaEnabled = false;
  await page.route("**/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/v1/auth/get-session") {
      await route.fulfill({
        json: signedIn
          ? {
              session: {
                id: "session-test",
                createdAt: "2026-09-25T05:00:00.000Z",
                expiresAt: "2026-09-26T05:00:00.000Z",
              },
              user: {
                id: "11111111-1111-4111-8111-111111111111",
                email: "admin@example.test",
                name: "Admin",
                emailVerified: true,
                twoFactorEnabled: mfaEnabled,
              },
            }
          : null,
      });
      return;
    }
    if (path === "/v1/auth/sign-in/email") {
      signedIn = true;
      await route.fulfill({ json: { twoFactorRedirect: false } });
      return;
    }
    if (path === "/v1/admin/system-health" && !mfaEnabled) {
      await route.fulfill({
        status: 403,
        contentType: "application/problem+json",
        json: {
          type: "https://notesia.local/problems/mfa-required",
          title: "Inicia sesión con segundo factor.",
          status: 403,
          code: "MFA_REQUIRED",
          requestId: "request-mfa",
        },
      });
      return;
    }
    if (path === "/v1/auth/two-factor/enable") {
      await route.fulfill({
        json: {
          method: "totp",
          totpURI: "otpauth://totp/NotesIA:admin?secret=ABCDEFGHIJKLMNOP&issuer=NotesIA",
          backupCodes: ["backup-one", "backup-two"],
        },
      });
      return;
    }
    if (path === "/v1/auth/two-factor/verify-totp") {
      mfaEnabled = true;
      await route.fulfill({ json: { status: true } });
      return;
    }
    if (path === "/v1/admin/system-health") {
      await route.fulfill({ json: health });
      return;
    }
    await route.fulfill({ status: 404, json: { error: "unhandled test route" } });
  });

  await page.goto("/login");
  await page.getByLabel("Correo").fill("admin@example.test");
  await page.getByLabel("Contraseña").fill("ExamplePassword2026!");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page.getByText("Protege la cuenta administradora")).toBeVisible();
  await page.getByLabel("Contraseña actual").fill("ExamplePassword2026!");
  await page.getByRole("button", { name: "Configurar autenticador" }).click();
  await expect(page.getByText("backup-one")).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByLabel("Primer código TOTP").fill("123456");
  await page.getByRole("button", { name: "Activar segundo factor" }).click();

  await expect(page.getByRole("heading", { name: "Salud del sistema" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test("an authenticated administrator can open every functional section", async ({ page }) => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const targetId = "22222222-2222-4222-8222-222222222222";
  await page.route("**/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/v1/auth/get-session") {
      await route.fulfill({
        json: {
          session: {
            id: "session-test",
            createdAt: "2026-09-25T05:00:00.000Z",
            expiresAt: "2026-09-26T05:00:00.000Z",
          },
          user: {
            id: userId,
            email: "admin@example.test",
            name: "Admin",
            emailVerified: true,
            twoFactorEnabled: true,
          },
        },
      });
      return;
    }
    if (path === "/v1/admin/system-health") {
      await route.fulfill({ json: health });
      return;
    }
    if (path === "/v1/admin/users") {
      await route.fulfill({
        json: {
          items: [
            {
              id: targetId,
              email: "student@example.test",
              name: "Student",
              role: null,
              suspendedAt: null,
              version: 1,
              createdAt: "2026-09-20T05:00:00.000Z",
            },
          ],
          nextCursor: null,
        },
      });
      return;
    }
    if (path === "/v1/admin/roles") {
      await route.fulfill({
        json: {
          items: [
            {
              userId,
              email: "admin@example.test",
              role: "admin",
              version: 1,
              assignedAt: "2026-09-24T05:00:00.000Z",
              updatedAt: "2026-09-24T05:00:00.000Z",
            },
          ],
          nextCursor: null,
        },
      });
      return;
    }
    if (path === "/v1/admin/privacy-documents") {
      await route.fulfill({
        json: {
          items: [
            {
              id: "33333333-3333-4333-8333-333333333333",
              type: "privacy",
              language: "es",
              version: 1,
              content: "Texto aprobado de prueba",
              publishedAt: null,
              createdAt: "2026-09-24T05:00:00.000Z",
            },
          ],
          nextCursor: null,
        },
      });
      return;
    }
    if (path === "/v1/admin/ai/providers") {
      await route.fulfill({
        json: [
          {
            id: "44444444-4444-4444-8444-444444444444",
            provider: "openai",
            enabled: false,
            keyConfigured: true,
            updatedAt: "2026-09-24T05:00:00.000Z",
          },
        ],
      });
      return;
    }
    if (path === "/v1/admin/ai/routes") {
      await route.fulfill({
        json: [
          {
            useCase: "extract_activity",
            provider: "openai",
            modelId: "gpt-5-mini-2026-08-01",
            timeoutMs: 10000,
            maxOutputTokens: 512,
            dailyBudgetTokens: 100000,
            inputPriceUsdPerMillion: "0.25",
            outputPriceUsdPerMillion: "2.00",
            alternate: null,
            enabled: false,
          },
        ],
      });
      return;
    }
    if (path === "/v1/admin/ai/usage") {
      await route.fulfill({
        json: {
          from: url.searchParams.get("from"),
          through: url.searchParams.get("through"),
          fallbacks: [],
          transitions: [],
          items: [
            {
              useCase: "extract_activity",
              provider: "openai",
              status: "success",
              requests: 2,
              reservedTokens: 0,
              inputTokens: 20,
              outputTokens: 10,
              knownCostUsd: "0.000025000",
              totalCostUsd: "0.000025000",
              uncostedRequests: 0,
              averageDurationMs: 100,
              p95DurationMs: 120,
              unmeasuredRequests: 0,
            },
          ],
        },
      });
      return;
    }
    if (path === "/v1/admin/audit") {
      await route.fulfill({
        json: {
          items: [
            {
              id: "55555555-5555-4555-8555-555555555555",
              actorId: userId,
              action: "account.suspended",
              targetId,
              recordedAt: "2026-09-25T05:00:00.000Z",
            },
          ],
          nextCursor: null,
        },
      });
      return;
    }
    await route.fulfill({ status: 404, json: { error: `unhandled ${path}` } });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Salud del sistema" })).toBeVisible();

  await page.getByRole("link", { name: "Usuarios" }).click();
  await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible();
  await expect(page.getByText("student@example.test")).toBeVisible();

  await page.getByRole("link", { name: "Roles" }).click();
  await expect(page.getByRole("heading", { name: "Roles" })).toBeVisible();
  await expect(page.getByText("admin@example.test").last()).toBeVisible();

  await page.getByRole("link", { name: "Privacidad" }).click();
  await expect(page.getByRole("heading", { name: "Privacidad y términos" })).toBeVisible();
  await expect(page.getByText("Política de privacidad")).toBeVisible();

  await page.getByRole("link", { name: "IA" }).click();
  await expect(page.getByRole("heading", { name: "Configuración de IA" })).toBeVisible();
  await expect(
    page.getByText("Conexión configurada; la clave guardada nunca se muestra"),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Rutas" }).click();
  await expect(page.getByText("gpt-5-mini-2026-08-01")).toBeVisible();
  await page.getByRole("tab", { name: "Uso" }).click();
  await expect(page.getByRole("cell", { name: "success" })).toBeVisible();

  await page.getByRole("link", { name: "Auditoría" }).click();
  await expect(page.getByRole("heading", { name: "Auditoría administrativa" })).toBeVisible();
  await expect(page.getByText("account.suspended")).toBeVisible();
});
