import type { Profile } from "@notesia/contracts";
import type { QueryClient } from "@tanstack/react-query";
import { updateProfile } from "@/core/api/profile";

/** Zona que usa la base de datos cuando nadie eligió una. */
export const UNSET_TIME_ZONE = "Etc/UTC";

export function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || UNSET_TIME_ZONE;
  } catch {
    return UNSET_TIME_ZONE;
  }
}

// Respaldo si el motor no expone Intl.supportedValuesOf.
const fallbackZones = [
  "America/Guayaquil",
  "America/Bogota",
  "America/Lima",
  "America/Caracas",
  "America/La_Paz",
  "America/Santiago",
  "America/Argentina/Buenos_Aires",
  "America/Montevideo",
  "America/Asuncion",
  "America/Sao_Paulo",
  "America/Mexico_City",
  "America/Guatemala",
  "America/Costa_Rica",
  "America/Panama",
  "America/Havana",
  "America/Santo_Domingo",
  "America/Puerto_Rico",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Pacific/Galapagos",
  "Europe/Madrid",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Rome",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
  UNSET_TIME_ZONE,
];

export function timeZoneOptions(...extra: string[]) {
  const supported = (
    Intl as unknown as { supportedValuesOf?: (key: "timeZone") => string[] }
  ).supportedValuesOf?.("timeZone");
  const zones = new Set([...extra, ...(supported?.length ? supported : fallbackZones)]);
  return [...zones].sort((a, b) => a.localeCompare(b));
}

/** "America/Argentina/Buenos_Aires" → "Buenos Aires (America/Argentina)". */
export function timeZoneLabel(zone: string) {
  const parts = zone.split("/");
  if (parts.length < 2) return zone;
  const city = (parts.pop() ?? "").replaceAll("_", " ");
  return `${city} (${parts.join("/")})`;
}

/** Guarda solo la zona horaria, conservando el resto del perfil. */
export function saveTimeZone(profile: Profile, timeZone: string) {
  return updateProfile({
    displayName: profile.displayName,
    language: profile.language,
    timeZone,
    avatar: profile.avatar,
    version: profile.version,
  });
}

/**
 * Un perfil sin zona elegida (la de la base de datos) adopta la del teléfono.
 * Se ejecuta una vez por sesión; después la zona solo cambia desde Preferencias.
 */
export async function adoptDeviceTimeZone(profile: Profile, queryClient: QueryClient) {
  const device = deviceTimeZone();
  if (profile.timeZone !== UNSET_TIME_ZONE || device === UNSET_TIME_ZONE) return;
  const updated = await saveTimeZone(profile, device);
  queryClient.setQueryData(["profile"], updated);
}
