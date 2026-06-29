import {
  RIVIERA_CO_BRAND_ATTRIBUTION,
  RIVIERA_MOTHER_BRAND_NAME,
} from "./motherBrand";
import type { BrandConfig } from "./types";

export function getMotherAttributionLine(brand: BrandConfig): string {
  if (brand.attributionStyle === "by") {
    return `by ${brand.motherBrandName}`;
  }
  return RIVIERA_CO_BRAND_ATTRIBUTION;
}

export function getCoBrandCompactLine(brand: BrandConfig): string {
  return `${brand.displayName} · ${brand.motherBrandName}`;
}

export function getHomeEyebrow(brand: BrandConfig, isCoBranded: boolean): string {
  if (brand.messaging.homeEyebrow?.trim()) {
    return brand.messaging.homeEyebrow.trim();
  }
  if (isCoBranded) {
    return `${brand.displayName} ${getMotherAttributionLine(brand)}`;
  }
  return brand.motherBrandName || RIVIERA_MOTHER_BRAND_NAME;
}

export function getAuthSubtitle(brand: BrandConfig): string {
  return (
    brand.messaging.authSubtitle?.trim() ||
    "Crea retas, gestiona torneos y sigue el ranking de tu grupo."
  );
}

export function getAuthProof(brand: BrandConfig): string {
  return brand.messaging.authProof?.trim() || "Usado por +200 jugadores activos";
}
