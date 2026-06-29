import { HACK_PADEL_MANIFEST } from "./manifests/hack-padel";
import { RIVIERA_DEFAULT_MANIFEST } from "./manifests/riviera-default";
import { resolveBrandingKeyForOrganizador } from "./organizerBindingResolver";
import type { BrandManifest, ClubBrandingKey } from "./types";

const MANIFESTS_BY_KEY: Record<string, BrandManifest> = {
  riviera: RIVIERA_DEFAULT_MANIFEST,
  "hack-padel": HACK_PADEL_MANIFEST,
};

export function getManifestByKey(key: ClubBrandingKey): BrandManifest {
  return MANIFESTS_BY_KEY[key] ?? RIVIERA_DEFAULT_MANIFEST;
}

export function listRegisteredManifestKeys(): ClubBrandingKey[] {
  return Object.keys(MANIFESTS_BY_KEY);
}

export { resolveBrandingKeyForOrganizador };

/** @deprecated Usar getManifestByKey */
export const getBrandConfigByKey = getManifestByKey;

/** @deprecated Usar resolveBrandingKeyForOrganizador */
export const resolveBrandKeyForOrganizador = resolveBrandingKeyForOrganizador;

export { ORGANIZADOR_CLUB_BINDINGS, ORGANIZADOR_CLUB_INDEX } from "./organizadorClubIndex";
