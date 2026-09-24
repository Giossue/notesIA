import {
  consentAcceptSchema,
  consentListSchema,
  consentRecordSchema,
  type Problem,
  privacyDocumentListSchema,
} from "@notesia/contracts";
import type { PrivacyRepository } from "@notesia/db";
import type { Hono } from "hono";
import { z } from "zod";

type Dependencies = {
  getSession(headers: Headers): Promise<{ user: { id: string } } | null>;
  privacy: PrivacyRepository;
};

function error(status: 401 | 409 | 422, code: string, title: string) {
  const problem: Problem = {
    type: `https://notesia.local/problems/${code.toLowerCase().replaceAll("_", "-")}`,
    title,
    status,
    code,
    requestId: crypto.randomUUID(),
  };
  return Response.json(problem, {
    status,
    headers: { "Content-Type": "application/problem+json" },
  });
}

function toConsent(row: Awaited<ReturnType<PrivacyRepository["currentConsents"]>>[number]) {
  return consentRecordSchema.parse({ ...row, recordedAt: row.recordedAt.toISOString() });
}

export function registerPrivacyRoutes(app: Hono, dependencies: Dependencies) {
  app.get("/v1/privacy/documents", async (c) => {
    const language = z.enum(["es", "en"]).safeParse(c.req.query("language") ?? "es");
    if (!language.success) return error(422, "VALIDATION_FAILED", "Idioma inválido.");
    const rows = await dependencies.privacy.published(language.data);
    return c.json(
      privacyDocumentListSchema.parse(
        rows.map((row) => ({ ...row, publishedAt: row.publishedAt.toISOString() })),
      ),
    );
  });

  app.get("/v1/me/consents", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const rows = await dependencies.privacy.currentConsents(session.user.id);
    return c.json(consentListSchema.parse(rows.map(toConsent)));
  });

  app.post("/v1/me/consents", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    let body: unknown = null;
    try {
      if (c.req.header("content-type")?.toLowerCase().startsWith("application/json"))
        body = await c.req.json();
    } catch {
      body = null;
    }
    const parsed = consentAcceptSchema.safeParse(body);
    if (!parsed.success) return error(422, "VALIDATION_FAILED", "Documento inválido.");
    const row = await dependencies.privacy.accept(session.user.id, parsed.data.documentId);
    if (!row) return error(409, "DOCUMENT_NOT_CURRENT", "El documento ya no está vigente.");
    return c.json(toConsent(row));
  });

  app.post("/v1/me/consents/ai/revoke", async (c) => {
    const session = await dependencies.getSession(c.req.raw.headers);
    if (!session) return error(401, "AUTH_REQUIRED", "Inicia sesión para continuar.");
    const row = await dependencies.privacy.revokeAi(session.user.id);
    return row ? c.json(toConsent(row)) : new Response(null, { status: 204 });
  });
}
