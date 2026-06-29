import { RIVIERA_CO_BRAND_ATTRIBUTION, RIVIERA_MOTHER_BRAND_NAME } from "./motherBrand";
import type { BrandManifest } from "./types";

export function getMotherAttributionLine(manifest: BrandManifest): string {
  if (manifest.tone.attribution === "by") {
    return `by ${manifest.motherBrand}`;
  }
  return RIVIERA_CO_BRAND_ATTRIBUTION;
}

export function getCoBrandCompactLine(manifest: BrandManifest): string {
  return `${manifest.displayName} · ${manifest.motherBrand}`;
}

export function getHomeEyebrow(
  manifest: BrandManifest,
  isClubBranded: boolean
): string {
  if (manifest.home.eyebrow?.trim()) {
    return manifest.home.eyebrow.trim();
  }
  if (isClubBranded) {
    return `${manifest.displayName} ${getMotherAttributionLine(manifest)}`;
  }
  return manifest.motherBrand || RIVIERA_MOTHER_BRAND_NAME;
}

export function getHomeWelcomeTitle(manifest: BrandManifest): string {
  return manifest.home.welcomeTitle;
}

export function getHomeWelcomeSubtitle(
  manifest: BrandManifest,
  userName?: string
): string {
  const base = manifest.home.welcomeSubtitle;
  const name = userName?.trim();
  if (name) {
    return `Hola, ${name}. ${base}`;
  }
  return base;
}

export function getHomeEmptyState(manifest: BrandManifest): {
  title: string;
  text: string;
} {
  return {
    title:
      manifest.home.emptyStateTitle?.trim() || "Aún no has creado retas",
    text:
      manifest.home.emptyStateText?.trim() ||
      "Selecciona un modo arriba para empezar a jugar.",
  };
}

export function getLandingSubtitle(manifest: BrandManifest): string {
  return (
    manifest.landing.subtitle?.trim() ||
    "Crea retas, gestiona torneos y sigue el ranking de tu grupo."
  );
}

export function getLandingProofLine(manifest: BrandManifest): string {
  return manifest.landing.proofLine?.trim() || "Usado por +200 jugadores activos";
}

/** @deprecated Usar getLandingSubtitle */
export const getAuthSubtitle = getLandingSubtitle;

/** @deprecated Usar getLandingProofLine */
export const getAuthProof = getLandingProofLine;
