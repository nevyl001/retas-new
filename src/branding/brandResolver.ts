import {
  getBrandConfigByKey,
  resolveBrandKeyForOrganizador,
} from "./brandRegistry";
import { RIVIERA_DEFAULT_BRAND } from "./defaultBrand";
import type { BrandConfig } from "./types";

export function resolveBrand(
  organizadorId: string | null | undefined
): BrandConfig {
  const key = resolveBrandKeyForOrganizador(organizadorId);
  if (key === "riviera") {
    return RIVIERA_DEFAULT_BRAND;
  }
  return getBrandConfigByKey(key);
}

export function isCoBrandedOrganizer(
  organizadorId: string | null | undefined
): boolean {
  return resolveBrandKeyForOrganizador(organizadorId) !== "riviera";
}
