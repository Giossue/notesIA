type Request = (path: string, init?: RequestInit) => Response | Promise<Response>;

/**
 * Para tests: acepta con la cookie dada la versión vigente de términos y
 * privacidad. Sin eso, la API bloquea la app con CONSENT_REQUIRED en cuanto la
 * base de pruebas tiene documentos publicados.
 */
export async function acceptCurrentDocuments(request: Request, cookie: string) {
  const response = await request("/v1/privacy/documents?language=es");
  const documents = (await response.json()) as Array<{ id: string; type: string }>;
  for (const document of documents.filter(({ type }) => type !== "ai")) {
    const accepted = await request("/v1/me/consents", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ documentId: document.id }),
    });
    if (accepted.status !== 200) throw new Error(`No se aceptó el documento ${document.id}`);
  }
}
