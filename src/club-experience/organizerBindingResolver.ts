import { getManifestByKey } from "./manifestRegistry";
import { ORGANIZADOR_CLUB_BINDINGS } from "./organizadorClubIndex";
import { RIVIERA_DEFAULT_MANIFEST } from "./manifests/riviera-default";
import type { ClubBrandingKey, ClubOrganizerBinding } from "./types";

let runtimeBindings: ClubOrganizerBinding[] = [];

export function setRuntimeOrganizerClubBindings(
  bindings: ClubOrganizerBinding[]
): void {
  runtimeBindings = bindings;
}

/** @deprecated Usar setRuntimeOrganizerClubBindings */
export const setRuntimeClubBindings = setRuntimeOrganizerClubBindings;

function normalizeOrganizadorId(
  organizadorId: string | null | undefined
): string | null {
  if (!organizadorId) return null;
  const normalized = organizadorId.trim().toLowerCase();
  return normalized || null;
}

function findStaticBinding(
  organizadorId: string
): ClubOrganizerBinding | undefined {
  return ORGANIZADOR_CLUB_BINDINGS.find(
    (binding) =>
      binding.organizadorId.trim().toLowerCase() === organizadorId
  );
}

function findRuntimeBinding(
  organizadorId: string
): ClubOrganizerBinding | undefined {
  return runtimeBindings.find(
    (binding) =>
      binding.organizadorId.trim().toLowerCase() === organizadorId
  );
}

/** Binding crudo (sin validar upgrade). Runtime gana sobre estático. */
export function findOrganizerClubBinding(
  organizadorId: string | null | undefined
): ClubOrganizerBinding | null {
  const normalized = normalizeOrganizadorId(organizadorId);
  if (!normalized) return null;

  return (
    findRuntimeBinding(normalized) ??
    findStaticBinding(normalized) ??
    null
  );
}

function isBindingEligible(binding: ClubOrganizerBinding): boolean {
  if (!binding.active) return false;
  if (!binding.premiumBrandingEnabled) return false;

  const manifest = getManifestByKey(binding.brandingKey);
  if (!manifest.active) return false;
  if (manifest.brandingKey === RIVIERA_DEFAULT_MANIFEST.brandingKey) {
    return false;
  }

  return Boolean(binding.brandingKey?.trim());
}

/**
 * Upgrade premium activo para este organizador.
 * Única puerta para aplicar co-branding (interno + público).
 */
export function isPremiumBrandingEnabledForOrganizador(
  organizadorId: string | null | undefined
): boolean {
  const binding = findOrganizerClubBinding(organizadorId);
  if (!binding) return false;
  return isBindingEligible(binding);
}

/** Clave de branding efectiva; siempre "riviera" sin upgrade elegible. */
export function resolveBrandingKeyForOrganizador(
  organizadorId: string | null | undefined
): ClubBrandingKey {
  if (!isPremiumBrandingEnabledForOrganizador(organizadorId)) {
    return RIVIERA_DEFAULT_MANIFEST.brandingKey;
  }

  const binding = findOrganizerClubBinding(organizadorId);
  return binding?.brandingKey ?? RIVIERA_DEFAULT_MANIFEST.brandingKey;
}
