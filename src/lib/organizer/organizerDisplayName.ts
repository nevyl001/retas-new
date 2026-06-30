import { RIVIERA_PRODUCT_NAME } from "../../club-experience/motherBrand";
import { supabase } from "../supabaseClient";

const organizerNameCache = new Map<string, string>();

export function clearOrganizerDisplayNameCache(): void {
  organizerNameCache.clear();
}

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

/** Resolución síncrona (caché o hint del perfil). */
export function getOrganizerDisplayNameSync(
  organizadorId: string | null | undefined,
  hintName?: string | null
): string {
  if (!organizadorId?.trim()) return RIVIERA_PRODUCT_NAME;

  const cached = getCachedOrganizerDisplayName(organizadorId);
  if (cached) return cached;

  if (hintName?.trim()) {
    return rememberOrganizerDisplayName(organizadorId, hintName.trim());
  }

  return RIVIERA_PRODUCT_NAME;
}

/** Nombre del club/organizador desde users.name vía RPC (upgrade no cambia el texto). */
export async function resolveOrganizerDisplayName(
  organizadorId: string | null | undefined,
  options?: { hintName?: string | null }
): Promise<string> {
  if (!organizadorId?.trim()) return RIVIERA_PRODUCT_NAME;

  const cached = getCachedOrganizerDisplayName(organizadorId);
  if (cached) return cached;

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
