import {
  applyBrandingSyncForOrganizador,
  clearTenantBranding,
  getAppliedBranding,
  resolveAndApplyBranding,
} from "../branding/BrandingService";
import {
  readClubExperienceCache,
  resolveBootstrapOrganizadorId,
} from "../branding/organizerResolver";
import { CLUB_EXPERIENCE_CACHE_KEY } from "../branding/constants";
import { RIVIERA_DEFAULT_MANIFEST } from "./manifests/riviera-default";
import type { BrandManifest } from "./types";

export { CLUB_EXPERIENCE_CACHE_KEY };

export { readClubExperienceCache, resolveBootstrapOrganizadorId };

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

  window.localStorage.setItem(
    CLUB_EXPERIENCE_CACHE_KEY,
    JSON.stringify({
      organizadorId: normalizedOrgId,
      brandingKey: manifest.brandingKey,
    })
  );
}

export function clearClubExperienceCache(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CLUB_EXPERIENCE_CACHE_KEY);
}

export function applyClubExperienceForOrganizador(
  organizadorId: string | null | undefined
): BrandManifest {
  return applyBrandingSyncForOrganizador(organizadorId).manifest;
}

/** @deprecated Usar bootstrapAppBranding en index.tsx */
export function bootstrapClubExperienceTheme(): void {
  void resolveAndApplyBranding(resolveBootstrapOrganizadorId());
}

export function resetClubExperienceTheme(): void {
  clearTenantBranding();
}

export { getAppliedBranding };
