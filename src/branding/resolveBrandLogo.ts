import type { BrandConfig } from "./types";

export type BrandLogoSurface = "dark" | "light" | "auto";

/** Elige logo según superficie; fallback en cadena si falta un asset. */
export function resolveBrandLogo(
  brand: BrandConfig,
  surface: BrandLogoSurface = "auto"
): string | null {
  const { assets } = brand;

  if (surface === "light") {
    return assets.logoLight ?? assets.logoDark ?? assets.iconSquare;
  }

  if (surface === "dark") {
    return assets.logoDark ?? assets.logoLight ?? assets.iconSquare;
  }

  return assets.logoDark ?? assets.logoLight ?? assets.iconSquare;
}
