import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { TwoFactorEnrollment } from "./two-factor-enrollment";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("enrolls TOTP only after showing backup codes and recording acknowledgement", async () => {
  const requests: Array<{ path: string; body: unknown }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    requests.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (path.endsWith("/two-factor/enable"))
      return Response.json({
        method: "totp",
        totpURI: "otpauth://totp/NotesIA:test?secret=ABCDEFGHIJKLMNOP&issuer=NotesIA",
        backupCodes: ["backup-one", "backup-two"],
      });
    if (path.endsWith("/two-factor/verify-totp")) return Response.json({ status: true });
    return Response.json({ title: "Ruta inesperada" }, { status: 500 });
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={client}>
      <TwoFactorEnrollment />
    </QueryClientProvider>,
  );

  await user.type(screen.getByLabelText("Contraseña actual"), "ExamplePassword2026!");
  await user.click(screen.getByRole("button", { name: "Configurar autenticador" }));

  expect(await screen.findByText("ABCDEFGHIJKLMNOP")).toBeInTheDocument();
  expect(screen.getByText("backup-one")).toBeInTheDocument();
  await user.type(screen.getByLabelText("Primer código TOTP"), "123456");
  await user.click(screen.getByRole("button", { name: "Activar segundo factor" }));
  expect(await screen.findByText("Guarda los códigos antes de continuar.")).toBeInTheDocument();

  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Activar segundo factor" }));

  expect(requests).toEqual([
    {
      path: "/v1/auth/two-factor/enable",
      body: { password: "ExamplePassword2026!", method: "totp" },
    },
    {
      path: "/v1/auth/two-factor/verify-totp",
      body: { code: "123456", trustDevice: false },
    },
  ]);
});
