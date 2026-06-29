import { mergeBrandManifest } from "./manifestFactory";
import { getManifestByKey } from "./manifestRegistry";
import {
  findOrganizerClubBinding,
  isPremiumBrandingEnabledForOrganizador,
  resolveBrandingKeyForOrganizador,
  setRuntimeOrganizerClubBindings,
} from "./organizerBindingResolver";
import { RIVIERA_DEFAULT_MANIFEST } from "./manifests/riviera-default";
import type {
  BrandManifest,
  ClubBrandingKey,
  ClubOrganizerBinding,
} from "./types";

/**
 * Fuente de manifiestos de club.
 *
 * Hoy: bindings estáticos en organizadorClubIndex.ts.
 * Mañana: setRuntimeOrganizerClubBindings() desde panel Riviera Open / Supabase.
 */
export interface ClubManifestSource {
  resolveKeyForOrganizador(
    organizadorId: string | null | undefined
  ): ClubBrandingKey;
  getManifestByKey(key: ClubBrandingKey): BrandManifest;
  resolveForOrganizador(
    organizadorId: string | null | undefined
  ): BrandManifest;
}

export function setRuntimeClubBindings(bindings: ClubOrganizerBinding[]): void {
  setRuntimeOrganizerClubBindings(bindings);
}

/** @deprecated Usar setRuntimeOrganizerClubBindings */
export const setRuntimeBrandBindings = setRuntimeClubBindings;

export const clubManifestSource: ClubManifestSource = {
  resolveKeyForOrganizador(organizadorId) {
    return resolveBrandingKeyForOrganizador(organizadorId);
  },

  getManifestByKey(key) {
    return getManifestByKey(key);
  },

  resolveForOrganizador(organizadorId) {
    if (!isPremiumBrandingEnabledForOrganizador(organizadorId)) {
      return RIVIERA_DEFAULT_MANIFEST;
    }

    const binding = findOrganizerClubBinding(organizadorId);
    const key = resolveBrandingKeyForOrganizador(organizadorId);
    const base = getManifestByKey(key);

    if (!binding?.active || !binding.premiumBrandingEnabled) {
      return RIVIERA_DEFAULT_MANIFEST;
    }

    if (key === RIVIERA_DEFAULT_MANIFEST.brandingKey || !base.active) {
      return RIVIERA_DEFAULT_MANIFEST;
    }

    return mergeBrandManifest(base, {
      active: binding.active,
      ...binding.overrides,
    });
  },
};

/** @deprecated Usar clubManifestSource */
export const brandConfigSource = clubManifestSource;
