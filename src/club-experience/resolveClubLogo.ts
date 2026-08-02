import type { BrandManifest } from "./types";

export type ClubLogoSurface = "dark" | "light" | "auto";

/** Elige logo según superficie; fallback en cadena si falta un asset. */
export function resolveClubLogo(
  manifest: BrandManifest,
  surface: ClubLogoSurface = "auto"
): string | null {
  const logos = manifest?.logos ?? {};

  if (surface === "light") {
    return logos.light ?? logos.dark ?? logos.square ?? null;
  }

  if (surface === "dark") {
    return logos.dark ?? logos.light ?? logos.square ?? null;
  }

  return logos.dark ?? logos.light ?? logos.square ?? null;
}

export function manifestHasClubLogo(manifest: BrandManifest): boolean {
  return Boolean(resolveClubLogo(manifest));
}

/** @deprecated Usar resolveClubLogo */
export const resolveBrandLogo = resolveClubLogo;

/** @deprecated Usar ClubLogoSurface */
export type BrandLogoSurface = ClubLogoSurface;
