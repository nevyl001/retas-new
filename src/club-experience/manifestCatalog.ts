// @ts-expect-error El empaquetador de Edge Functions exige la extensión .ts.
import { ACAPULCO_PADEL_TOUR_MANIFEST } from "./manifests/acapulco-padel-tour.ts";
// @ts-expect-error El empaquetador de Edge Functions exige la extensión .ts.
import { HACK_PADEL_MANIFEST } from "./manifests/hack-padel.ts";
// @ts-expect-error El empaquetador de Edge Functions exige la extensión .ts.
import { PADEL_COURT_SERIES_MANIFEST } from "./manifests/padel-court-series.ts";
// @ts-expect-error El empaquetador de Edge Functions exige la extensión .ts.
import { PADELITO_WAREHOUSE_MANIFEST } from "./manifests/padelito-warehouse.ts";
// @ts-expect-error El empaquetador de Edge Functions exige la extensión .ts.
import { VALVIDUB_SPORTS_MANIFEST } from "./manifests/valvidub-sports.ts";
// @ts-expect-error El empaquetador de Edge Functions exige la extensión .ts.
import { RIVIERA_DEFAULT_MANIFEST } from "./manifests/riviera-default.ts";
// @ts-expect-error El empaquetador de Edge Functions exige la extensión .ts.
import type { BrandManifest, ClubBrandingKey } from "./types.ts";

const MANIFESTS_BY_KEY: Record<string, BrandManifest> = {
  riviera: RIVIERA_DEFAULT_MANIFEST,
  "hack-padel": HACK_PADEL_MANIFEST,
  "padel-court-series": PADEL_COURT_SERIES_MANIFEST,
  "padelito-warehouse": PADELITO_WAREHOUSE_MANIFEST,
  "valvidub-sports": VALVIDUB_SPORTS_MANIFEST,
  "acapulco-padel-tour": ACAPULCO_PADEL_TOUR_MANIFEST,
};

export function getManifestByKey(key: ClubBrandingKey): BrandManifest {
  return MANIFESTS_BY_KEY[key] ?? RIVIERA_DEFAULT_MANIFEST;
}

export function listRegisteredManifestKeys(): ClubBrandingKey[] {
  return Object.keys(MANIFESTS_BY_KEY);
}

/** Manifiestos disponibles para asignar como upgrade premium (excluye riviera). */
export function listPremiumManifestOptions(): Array<{
  key: ClubBrandingKey;
  label: string;
}> {
  return listRegisteredManifestKeys()
    .filter((key) => key !== RIVIERA_DEFAULT_MANIFEST.brandingKey)
    .map((key) => {
      const manifest = getManifestByKey(key);
      return {
        key,
        label: manifest.displayName?.trim() || key,
      };
    })
    .filter((option) => getManifestByKey(option.key).active);
}
