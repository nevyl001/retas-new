import {
  applyClubExperienceTheme,
  applyClubFavicon,
  applyClubKeyToDocument,
  clearClubExperienceTheme,
} from "./applyClubExperienceTheme";
import { getPublicOrganizadorIdFromPath } from "../lib/rivieraJugadores/publicOrganizador";
import {
  isClubBrandedOrganizer,
  resolveClubManifest,
} from "./manifestResolver";
import { RIVIERA_DEFAULT_MANIFEST } from "./manifests/riviera-default";
import type { BrandManifest, ClubBrandingKey } from "./types";

export const CLUB_EXPERIENCE_CACHE_KEY = "ro_club_experience_v1";

interface ClubExperienceCache {
  organizadorId: string;
  brandingKey: ClubBrandingKey;
}

function readSupabaseSessionUserId(): string | null {
  if (typeof window === "undefined") return null;

  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith("sb-") || !key.endsWith("-auth-token")) continue;

      const raw = window.localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw) as {
        user?: { id?: string };
        currentSession?: { user?: { id?: string } };
      };

      const userId =
        parsed.user?.id?.trim() || parsed.currentSession?.user?.id?.trim();
      if (userId) return userId;
    }
  } catch {
    /* ignore malformed auth storage */
  }

  return null;
}

export function readClubExperienceCache(): ClubExperienceCache | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(CLUB_EXPERIENCE_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<ClubExperienceCache>;
    const organizadorId = parsed.organizadorId?.trim().toLowerCase();
    const brandingKey = parsed.brandingKey?.trim() as ClubBrandingKey | undefined;

    if (!organizadorId || !brandingKey) return null;
    if (brandingKey === RIVIERA_DEFAULT_MANIFEST.brandingKey) return null;

    return { organizadorId, brandingKey };
  } catch {
    return null;
  }
}

export function persistClubExperienceCache(
  organizadorId: string | null | undefined,
  manifest: BrandManifest
): void {
  if (typeof window === "undefined") return;

  const normalizedOrgId = organizadorId?.trim().toLowerCase() || null;
  if (
    !normalizedOrgId ||
    manifest.brandingKey === RIVIERA_DEFAULT_MANIFEST.brandingKey
  ) {
    window.localStorage.removeItem(CLUB_EXPERIENCE_CACHE_KEY);
    return;
  }

  const payload: ClubExperienceCache = {
    organizadorId: normalizedOrgId,
    brandingKey: manifest.brandingKey,
  };
  window.localStorage.setItem(CLUB_EXPERIENCE_CACHE_KEY, JSON.stringify(payload));
}

export function clearClubExperienceCache(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CLUB_EXPERIENCE_CACHE_KEY);
}

/** Org disponible antes de que React/Supabase terminen de hidratar. */
export function resolveBootstrapOrganizadorId(): string | null {
  const fromPath = getPublicOrganizadorIdFromPath();
  if (fromPath) return fromPath;

  const fromSession = readSupabaseSessionUserId();
  if (fromSession) return fromSession;

  return readClubExperienceCache()?.organizadorId ?? null;
}

export function applyClubExperienceForOrganizador(
  organizadorId: string | null | undefined
): BrandManifest {
  const manifest = resolveClubManifest(organizadorId);
  const isClubBranded = isClubBrandedOrganizer(organizadorId);

  applyClubKeyToDocument(manifest.brandingKey);
  applyClubExperienceTheme(manifest);

  if (isClubBranded) {
    applyClubFavicon(manifest);
    persistClubExperienceCache(organizadorId, manifest);
  } else {
    clearClubExperienceCache();
  }

  return manifest;
}

/** Aplica tema de club lo antes posible (antes del primer render de React). */
export function bootstrapClubExperienceTheme(): void {
  if (typeof window === "undefined") return;
  applyClubExperienceForOrganizador(resolveBootstrapOrganizadorId());
}

export function resetClubExperienceTheme(): void {
  if (typeof window === "undefined") return;
  clearClubExperienceCache();
  applyClubKeyToDocument(RIVIERA_DEFAULT_MANIFEST.brandingKey);
  clearClubExperienceTheme();
}
