import { HACK_PADEL_BRAND } from "./brands/hack-padel";
import { RIVIERA_DEFAULT_BRAND } from "./defaultBrand";
import { ORGANIZADOR_BRAND_INDEX } from "./organizadorBrandIndex";
import type { BrandConfig, BrandKey } from "./types";

const BRANDS_BY_KEY: Record<string, BrandConfig> = {
  riviera: RIVIERA_DEFAULT_BRAND,
  "hack-padel": HACK_PADEL_BRAND,
};

export function getBrandConfigByKey(key: BrandKey): BrandConfig {
  return BRANDS_BY_KEY[key] ?? RIVIERA_DEFAULT_BRAND;
}

export function listRegisteredBrandKeys(): BrandKey[] {
  return Object.keys(BRANDS_BY_KEY);
}

export function resolveBrandKeyForOrganizador(
  organizadorId: string | null | undefined
): BrandKey {
  if (!organizadorId) return "riviera";
  const normalized = organizadorId.trim().toLowerCase();
  const key = ORGANIZADOR_BRAND_INDEX[normalized];
  if (!key) return "riviera";
  const config = getBrandConfigByKey(key);
  return config.active ? key : "riviera";
}

export { ORGANIZADOR_BRAND_INDEX };
