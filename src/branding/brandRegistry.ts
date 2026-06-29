import { HACK_PADEL_BRAND } from "./brands/hack-padel";
import { RIVIERA_DEFAULT_BRAND } from "./defaultBrand";
import { ORGANIZADOR_BRAND_INDEX } from "./organizadorBrandIndex";
import type { BrandConfig, BrandKey } from "./types";

const BRANDS_BY_KEY: Record<BrandKey, BrandConfig> = {
  riviera: RIVIERA_DEFAULT_BRAND,
  "hack-padel": HACK_PADEL_BRAND,
};

export function getBrandConfigByKey(key: BrandKey): BrandConfig {
  return BRANDS_BY_KEY[key] ?? RIVIERA_DEFAULT_BRAND;
}

export function resolveBrandKeyForOrganizador(
  organizadorId: string | null | undefined
): BrandKey {
  if (!organizadorId) return "riviera";
  const normalized = organizadorId.trim().toLowerCase();
  return ORGANIZADOR_BRAND_INDEX[normalized] ?? "riviera";
}

export { ORGANIZADOR_BRAND_INDEX };
