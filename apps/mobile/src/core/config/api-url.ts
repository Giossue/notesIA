const localApiBaseUrl = "http://127.0.0.1:3000/v1";

export function normalizeApiBaseUrl(value: unknown, development: boolean) {
  const raw = typeof value === "string" && value.trim() ? value.trim() : null;
  const candidate = raw ?? (development ? localApiBaseUrl : null);
  if (!candidate) throw new Error("La URL de la API no está configurada en esta aplicación.");

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("La URL de la API configurada no es válida.");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/v1" ||
    parsed.search ||
    parsed.hash ||
    (!development && parsed.protocol !== "https:")
  ) {
    throw new Error("La URL de la API debe ser un origen HTTPS seguido de /v1.");
  }
  return parsed.toString().replace(/\/$/, "");
}
