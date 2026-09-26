import type { AuthMailConfig } from "@notesia/config";
import { withTraceSpan } from "@notesia/observability";
import nodemailer from "nodemailer";

export function createAuthSmtpSender(config: AuthMailConfig["smtp"]) {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
    tls: config.tlsServername ? { servername: config.tlsServername } : undefined,
  });
  const send = (email: string, subject: string, text: string) =>
    withTraceSpan({ name: "provider.smtp", component: "provider", target: "smtp" }, async () => {
      try {
        await transport.sendMail({ from: config.from, to: email, subject, text });
      } catch (error) {
        // Solo el código del proveedor (p. ej. 525 IP no autorizada, 535 credenciales),
        // nunca el correo ni el enlace: basta para diagnosticar desde los logs.
        const { code, responseCode, command } = error as {
          code?: unknown;
          responseCode?: unknown;
          command?: unknown;
        };
        console.error(
          JSON.stringify({
            event: "smtp_error",
            code: typeof code === "string" ? code : undefined,
            responseCode: typeof responseCode === "number" ? responseCode : undefined,
            command: typeof command === "string" ? command : undefined,
          }),
        );
        throw error;
      }
    });
  return {
    recovery(email: string, resetUrl: string) {
      return send(
        email,
        "Restablece tu contraseña de NotesIA",
        `Abre este enlace para restablecer tu contraseña. Caduca en 15 minutos:\n\n${resetUrl}\n\nSi no lo solicitaste, ignora este mensaje.`,
      );
    },
    verification(email: string, verificationUrl: string) {
      return send(
        email,
        "Verifica tu correo de NotesIA",
        `Abre este enlace para verificar tu correo y activar tu cuenta. Caduca en 15 minutos:\n\n${verificationUrl}\n\nSi no creaste esta cuenta, ignora este mensaje.`,
      );
    },
  };
}
