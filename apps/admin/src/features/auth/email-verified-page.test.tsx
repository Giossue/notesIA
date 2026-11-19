import { render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EmailVerifiedPage } from "./email-verified-page";

const renderPage = () =>
  render(
    <TooltipProvider>
      <EmailVerifiedPage />
    </TooltipProvider>,
  );

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

test("confirms the verification on the web and offers to open the app", () => {
  window.history.replaceState(null, "", "/email-verified");
  renderPage();
  expect(screen.getByRole("heading", { name: "Correo verificado" })).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Ya puedes volver a NotesIA");
  expect(screen.getByRole("link", { name: "Abrir NotesIA" })).toHaveAttribute(
    "href",
    "notesia://email-verified",
  );
});

test("explains an invalid or expired link without offering the app", () => {
  window.history.replaceState(null, "", "/email-verified?error=token_expired");
  renderPage();
  expect(screen.getByRole("heading", { name: "No se pudo verificar" })).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("Reenviar correo");
  expect(screen.queryByRole("link", { name: "Abrir NotesIA" })).not.toBeInTheDocument();
});
