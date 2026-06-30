import {
  getManifestByKey,
  isClubBrandedOrganizer,
  resolveBrandingKeyForOrganizador,
} from "../../club-experience";
import { RIVIERA_PRODUCT_NAME } from "../../club-experience/motherBrand";
import { supabase } from "../supabaseClient";

const organizerNameCache = new Map<string, string>();

function cacheKey(organizadorId: string): string {
  return organizadorId.trim().toLowerCase();
}

export function getCachedOrganizerDisplayName(
  organizadorId: string | null | undefined
): string | null {
  if (!organizadorId?.trim()) return null;
  return organizerNameCache.get(cacheKey(organizadorId)) ?? null;
}

export function rememberOrganizerDisplayName(
  organizadorId: string,
  name: string
): string {
  const trimmed = name.trim() || RIVIERA_PRODUCT_NAME;
  organizerNameCache.set(cacheKey(organizadorId), trimmed);
  return trimmed;
}

function manifestDisplayName(organizadorId: string): string {
  const key = resolveBrandingKeyForOrganizador(organizadorId);
  return getManifestByKey(key)?.displayName ?? RIVIERA_PRODUCT_NAME;
}

/** Resolución síncrona (caché o manifiesto premium). */
export function getOrganizerDisplayNameSync(
  organizadorId: string | null | undefined,
  hintName?: string | null
): string {
  if (!organizadorId?.trim()) return RIVIERA_PRODUCT_NAME;

  const cached = getCachedOrganizerDisplayName(organizadorId);
  if (cached) return cached;

  if (isClubBrandedOrganizer(organizadorId)) {
    return rememberOrganizerDisplayName(organizadorId, manifestDisplayName(organizadorId));
  }

  if (hintName?.trim()) {
    return rememberOrganizerDisplayName(organizadorId, hintName.trim());
  }

  return RIVIERA_PRODUCT_NAME;
}

/** Nombre del club: manifiesto premium o users.name vía RPC. */
export async function resolveOrganizerDisplayName(
  organizadorId: string | null | undefined,
  options?: { hintName?: string | null }
): Promise<string> {
  if (!organizadorId?.trim()) return RIVIERA_PRODUCT_NAME;

  const cached = getCachedOrganizerDisplayName(organizadorId);
  if (cached) return cached;

  if (isClubBrandedOrganizer(organizadorId)) {
    return rememberOrganizerDisplayName(organizadorId, manifestDisplayName(organizadorId));
  }

  if (options?.hintName?.trim()) {
    return rememberOrganizerDisplayName(organizadorId, options.hintName.trim());
  }

  const { data, error } = await supabase.rpc("get_organizador_display_name", {
    p_organizador_id: organizadorId,
  });

  if (!error && typeof data === "string" && data.trim()) {
    return rememberOrganizerDisplayName(organizadorId, data);
  }

  return RIVIERA_PRODUCT_NAME;
}
