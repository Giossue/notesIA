import type { RecoveryConfig } from "@notesia/config";
import { withTraceSpan } from "@notesia/observability";
import nodemailer from "nodemailer";

export function createRecoverySmtpSender(config: RecoveryConfig["smtp"]) {
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
  return (email: string, resetUrl: string) =>
    withTraceSpan({ name: "provider.smtp", component: "provider", target: "smtp" }, async () => {
      await transport.sendMail({
        from: config.from,
        to: email,
        subject: "Restablece tu contraseña de NotesIA",
        text: `Abre este enlace para restablecer tu contraseña. Caduca en 15 minutos:\n\n${resetUrl}\n\nSi no lo solicitaste, ignora este mensaje.`,
      });
    });
}
