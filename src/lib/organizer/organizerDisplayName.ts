import { RIVIERA_PRODUCT_NAME } from "../../club-experience/motherBrand";
import { supabase } from "../supabaseClient";

const organizerNameCache = new Map<string, string>();

/** Placeholder mientras llega el nombre real vía RPC (nunca el producto madre). */
export const ORGANIZER_DISPLAY_NAME_PENDING = "Club";

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

function isMotherBrandLabel(name: string): boolean {
  return (
    name.localeCompare(RIVIERA_PRODUCT_NAME, undefined, {
      sensitivity: "accent",
    }) === 0
  );
}

/**
 * Resolución síncrona (caché o hint del perfil).
 * Sin caché no devolvemos «Riviera Open» para un UUID ajeno: ese fallback
 * contaminaba filas (p. ej. Hackpadel → Riviera Open) hasta el prefetch.
 */
export function getOrganizerDisplayNameSync(
  organizadorId: string | null | undefined,
  hintName?: string | null
): string {
  if (!organizadorId?.trim()) return RIVIERA_PRODUCT_NAME;

  const cached = getCachedOrganizerDisplayName(organizadorId);
  if (cached) return cached;

  const hint = hintName?.trim();
  // El hint «Riviera Open» suele ser el fallback histórico, no el nombre real.
  if (hint && !isMotherBrandLabel(hint)) {
    return rememberOrganizerDisplayName(organizadorId, hint);
  }

  return ORGANIZER_DISPLAY_NAME_PENDING;
}

/** Nombre del club/organizador desde users.name vía RPC (upgrade no cambia el texto). */
export async function resolveOrganizerDisplayName(
  organizadorId: string | null | undefined,
  options?: { hintName?: string | null }
): Promise<string> {
  if (!organizadorId?.trim()) return RIVIERA_PRODUCT_NAME;

  const cached = getCachedOrganizerDisplayName(organizadorId);
  if (cached) return cached;

  const hint = options?.hintName?.trim();
  if (hint && !isMotherBrandLabel(hint)) {
    return rememberOrganizerDisplayName(organizadorId, hint);
  }

  const { data, error } = await supabase.rpc("get_organizador_display_name", {
    p_organizador_id: organizadorId,
  });

  if (!error && typeof data === "string" && data.trim()) {
    return rememberOrganizerDisplayName(organizadorId, data);
  }

  return ORGANIZER_DISPLAY_NAME_PENDING;
}
