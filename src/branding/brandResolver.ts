import { brandConfigSource } from "./brandConfigSource";
import { RIVIERA_DEFAULT_BRAND } from "./defaultBrand";
import type { BrandConfig } from "./types";

export function resolveBrand(
  organizadorId: string | null | undefined
): BrandConfig {
  return brandConfigSource.resolveForOrganizador(organizadorId);
}

export function isCoBrandedOrganizer(
  organizadorId: string | null | undefined
): boolean {
  const brand = brandConfigSource.resolveForOrganizador(organizadorId);
  return brand.key !== RIVIERA_DEFAULT_BRAND.key && brand.active;
}
