import { clubManifestSource } from "./manifestSource";
import {
  isPremiumBrandingEnabledForOrganizador,
  resolveBrandingKeyForOrganizador,
} from "./organizerBindingResolver";
import { RIVIERA_DEFAULT_MANIFEST } from "./manifests/riviera-default";
import type { BrandManifest } from "./types";

export function resolveClubManifest(
  organizadorId: string | null | undefined
): BrandManifest {
  return clubManifestSource.resolveForOrganizador(organizadorId);
}

export function isClubBrandedOrganizer(
  organizadorId: string | null | undefined
): boolean {
  if (!isPremiumBrandingEnabledForOrganizador(organizadorId)) {
    return false;
  }
  return (
    resolveBrandingKeyForOrganizador(organizadorId) !==
    RIVIERA_DEFAULT_MANIFEST.brandingKey
  );
}

/** @deprecated Usar resolveClubManifest */
export const resolveBrand = resolveClubManifest;

/** @deprecated Usar isClubBrandedOrganizer */
export const isCoBrandedOrganizer = isClubBrandedOrganizer;
