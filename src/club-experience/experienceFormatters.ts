import {
  RIVIERA_CO_BRAND_ATTRIBUTION,
  RIVIERA_MOTHER_BRAND_NAME,
  RIVIERA_PRODUCT_NAME,
} from "./motherBrand";
import { manifestHasClubLogo } from "./resolveClubLogo";
import type { BrandManifest } from "./types";

function resolveOrganizerLabel(organizerDisplayName?: string | null): string {
  const trimmed = organizerDisplayName?.trim();
  return trimmed || RIVIERA_PRODUCT_NAME;
}

/** Título de página del registro de jugadores del organizador. */
export function getRegistryPageTitle(organizerDisplayName: string): string {
  return `Registro ${resolveOrganizerLabel(organizerDisplayName)}`;
}

/** Etiqueta de sección «registro» en modos de juego. */
export function getRegistrySectionLabel(organizerDisplayName: string): string {
  return getRegistryPageTitle(organizerDisplayName);
}

export function getRegistryEmptyMessage(organizerDisplayName: string): string {
  return `No hay jugadores en el registro. Créalos en ${getRegistryPageTitle(organizerDisplayName)}.`;
}

export function getOrganizerRegistryCardSubtitle(
  organizerDisplayName: string
): string {
  return `${resolveOrganizerLabel(organizerDisplayName)} · fichas, categorías e historial`;
}

export function getDueloRegistryHint(organizerDisplayName: string): string {
  return `Jugadores de tu registro ${resolveOrganizerLabel(organizerDisplayName)} · elige 2 y pulsa agregar pareja`;
}

export function getDueloHomeSubtitle(organizerDisplayName: string): string {
  return `Encuentros entre dos parejas del registro ${resolveOrganizerLabel(organizerDisplayName)}. Suman al ranking del club (+25 participar, +100 ganar).`;
}

export function getDuelo2v2ModeDescription(organizerDisplayName: string): string {
  return `Dos parejas del registro · suma al ranking ${resolveOrganizerLabel(organizerDisplayName)}`;
}

export function getOrganizerCelebrateTagline(organizerDisplayName: string): string {
  return `${resolveOrganizerLabel(organizerDisplayName)} · Vive el pádel diferente`;
}

export function formatTenantDocumentTitle(
  eventName: string | null | undefined,
  organizerDisplayName: string,
  fallbackPageLabel: string
): string {
  const org = resolveOrganizerLabel(organizerDisplayName);
  if (eventName?.trim()) return `${eventName.trim()} · ${org}`;
  return `${fallbackPageLabel} · ${org}`;
}

export function getAccountModeDisabledMessage(
  modeLabel: string,
  organizerDisplayName: string
): string {
  return `${modeLabel} no está habilitado para tu cuenta. Contacta a ${resolveOrganizerLabel(organizerDisplayName)}.`;
}

export function getLigaVictoriaCelebrateMessage(organizerDisplayName: string): string {
  return `Dejaron todo en la cancha. Así se compite en ${resolveOrganizerLabel(organizerDisplayName)}.`;
}

export function getDueloWinnerCelebrateMessage(
  finalizado: boolean,
  hasRating: boolean,
  organizerDisplayName: string
): string {
  const org = resolveOrganizerLabel(organizerDisplayName);
  if (finalizado) {
    return hasRating
      ? `¡Victoria confirmada! Subieron su nivel y sumaron puntos al ranking de ${org}. Sigan así en la cancha.`
      : `¡Victoria confirmada! Sumaron puntos al ranking de ${org}. Sigan dominando la cancha.`;
  }
  return `¡Se llevan la victoria! Gran duelo en ${org}.`;
}

export function getDueloLoserCelebrateMessage(
  finalizado: boolean,
  hasRating: boolean,
  organizerDisplayName: string
): string {
  const org = resolveOrganizerLabel(organizerDisplayName);
  if (finalizado) {
    return hasRating
      ? "Este duelo también cuenta. Sigan entrenando, sigan mejorando y verán su nivel subir partido a partido. ¡La revancha está más cerca de lo que creen!"
      : `Gran esfuerzo en la cancha. Sigan entrenando, jugando y mejorando — cada duelo los acerca más arriba en ${org}.`;
  }
  return `Gran duelo. Sigan entrenando y mejorando — la revancha y el siguiente nivel los esperan en ${org}.`;
}

export function getWinnersSectionAriaLabel(organizerDisplayName: string): string {
  return `Ganadores ${resolveOrganizerLabel(organizerDisplayName)}`;
}

export function getPodiumFinalAriaLabel(organizerDisplayName: string): string {
  return `Podio final ${resolveOrganizerLabel(organizerDisplayName)}`;
}

export function getOrganizerCelebrateParticipantesNote(
  organizerDisplayName: string
): string {
  return `Gracias a los cuatro jugadores por competir y seguir escribiendo su historia en ${resolveOrganizerLabel(organizerDisplayName)}.`;
}

export function getDueloFinalizarConfirmMessage(organizerDisplayName: string): string {
  return `¿Finalizar el duelo? Se registrarán los puntos en el ranking de ${resolveOrganizerLabel(organizerDisplayName)} y aparecerá en el historial de los jugadores.`;
}

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
  isClubBranded: boolean,
  organizerDisplayName?: string | null
): string {
  if (manifest.home.eyebrow?.trim()) {
    return manifest.home.eyebrow.trim();
  }
  // El logo del club en el header ya identifica al organizador; no repetir nombre.
  if (isClubBranded && manifestHasClubLogo(manifest)) {
    return "";
  }
  if (organizerDisplayName?.trim()) {
    return organizerDisplayName.trim();
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
