import { CLUB_EXPERIENCE_CACHE_KEY } from "./constants";
import { RIVIERA_DEFAULT_MANIFEST } from "../club-experience/manifests/riviera-default";
import { getPublicOrganizadorIdFromPath } from "../lib/rivieraJugadores/publicOrganizador";

interface ClubExperienceCache {
  organizadorId: string;
  brandingKey: string;
}

export function readClubExperienceCache(): ClubExperienceCache | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(CLUB_EXPERIENCE_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<ClubExperienceCache>;
    const organizadorId = parsed.organizadorId?.trim().toLowerCase();
    const brandingKey = parsed.brandingKey?.trim();

    if (!organizadorId || !brandingKey) return null;
    if (brandingKey === RIVIERA_DEFAULT_MANIFEST.brandingKey) return null;

    return { organizadorId, brandingKey };
  } catch {
    return null;
  }
}

/**
 * Caché anti-flash solo si el organizador esperado ya es conocido y coincide.
 * Nunca devolver caché premium a ciegas para una ruta pública sin org.
 */
export function getClubExperienceCacheIfMatches(
  expectedOrganizadorId: string | null | undefined
): ClubExperienceCache | null {
  const expected = expectedOrganizadorId?.trim().toLowerCase();
  if (!expected) return null;
  const cached = readClubExperienceCache();
  if (!cached || cached.organizadorId !== expected) return null;
  return cached;
}

/** Organizador inferido solo desde la URL (ranking público). Sin sesión ni caché. */
export function resolveBootstrapOrganizadorId(): string | null {
  return getPublicOrganizadorIdFromPath();
}
