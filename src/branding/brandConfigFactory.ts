import {
  RIVIERA_ATTRIBUTION_STYLE,
  RIVIERA_DEFAULT_SLOGAN,
  RIVIERA_MOTHER_BRAND_NAME,
  RIVIERA_PRODUCT_NAME,
} from "./motherBrand";
import type { BrandAssets, BrandConfig, BrandConfigInput } from "./types";

const EMPTY_ASSETS: BrandAssets = {
  logoLight: null,
  logoDark: null,
  favicon: null,
  heroImage: null,
  iconSquare: null,
};

function mergeAssets(
  base: BrandAssets,
  patch?: Partial<BrandAssets>
): BrandAssets {
  if (!patch) return base;
  return {
    logoLight: patch.logoLight ?? base.logoLight,
    logoDark: patch.logoDark ?? base.logoDark,
    favicon: patch.favicon ?? base.favicon,
    heroImage: patch.heroImage ?? base.heroImage,
    iconSquare: patch.iconSquare ?? base.iconSquare,
  };
}

/** Normaliza entrada del panel o seeds estáticos a BrandConfig completo. */
export function createBrandConfig(input: BrandConfigInput): BrandConfig {
  const assets = mergeAssets(EMPTY_ASSETS, input.assets);

  return {
    key: input.key,
    active: input.active ?? true,
    displayName: input.displayName ?? RIVIERA_PRODUCT_NAME,
    motherBrandName: input.motherBrandName ?? RIVIERA_MOTHER_BRAND_NAME,
    attributionStyle: input.attributionStyle ?? RIVIERA_ATTRIBUTION_STYLE,
    assets,
    messaging: {
      slogan: input.messaging?.slogan ?? RIVIERA_DEFAULT_SLOGAN,
      welcomeTitle: input.messaging?.welcomeTitle,
      welcomeSubtitle: input.messaging?.welcomeSubtitle,
      homeEyebrow: input.messaging?.homeEyebrow,
      authSubtitle: input.messaging?.authSubtitle,
      authProof: input.messaging?.authProof,
    },
    colors: input.colors!,
    typography: input.typography!,
  };
}

/** Merge overrides del panel sobre la config base de una marca. */
export function mergeBrandConfig(
  base: BrandConfig,
  overrides?: BrandOrganizerOverrides
): BrandConfig {
  if (!overrides) return base;

  return createBrandConfig({
    ...base,
    ...overrides,
    key: base.key,
    assets: mergeAssets(base.assets, overrides.assets),
    messaging: { ...base.messaging, ...overrides.messaging },
    colors: overrides.colors ? { ...base.colors, ...overrides.colors } : base.colors,
    typography: overrides.typography
      ? { ...base.typography, ...overrides.typography }
      : base.typography,
  });
}

export type BrandOrganizerOverrides = Partial<
  Omit<BrandConfig, "key" | "assets" | "messaging" | "colors" | "typography">
> & {
  assets?: Partial<BrandAssets>;
  messaging?: Partial<BrandConfig["messaging"]>;
  colors?: Partial<BrandConfig["colors"]>;
  typography?: Partial<BrandConfig["typography"]>;
};
