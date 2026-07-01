import { supabase } from "../supabaseClient";
import { normalizePlayerNameKey } from "./playerNameKey";

function isMissingBlocklistError(
  error: { code?: string; message?: string; status?: number } | null
): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.status === 404 ||
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "42883" ||
    error.code === "PGRST202" ||
    msg.includes("riviera_jugador_import_blocklist") ||
    msg.includes("is_jugador_import_blocked") ||
    msg.includes("register_riviera_jugador_import_blocklist")
  );
}

export async function registerJugadorImportBlocklist(
  organizadorId: string,
  params: {
    nombre: string;
    legacyPlayerId?: string | null;
    legacyLigaJugadorId?: string | null;
  }
): Promise<void> {
  const org = organizadorId.trim();
  const nombre = params.nombre?.trim();
  if (!org || !nombre) return;

  const { error } = await supabase.rpc("register_riviera_jugador_import_blocklist", {
    p_organizador_id: org,
    p_nombre: nombre,
    p_legacy_player_id: params.legacyPlayerId?.trim() || null,
    p_legacy_liga_jugador_id: params.legacyLigaJugadorId?.trim() || null,
  });

  if (error) {
    if (isMissingBlocklistError(error)) return;
    console.warn("[riviera-jugadores] registerJugadorImportBlocklist:", error.message);
  }
}

export async function isJugadorImportBlocked(
  organizadorId: string,
  params: {
    nombre?: string | null;
    legacyPlayerId?: string | null;
    legacyLigaJugadorId?: string | null;
  }
): Promise<boolean> {
  const org = organizadorId.trim();
  if (!org) return false;

  const nombre = params.nombre?.trim() || null;
  const legacyPlayerId = params.legacyPlayerId?.trim() || null;
  const legacyLigaJugadorId = params.legacyLigaJugadorId?.trim() || null;

  if (!nombre && !legacyPlayerId && !legacyLigaJugadorId) return false;

  const { data, error } = await supabase.rpc("is_jugador_import_blocked", {
    p_organizador_id: org,
    p_nombre: nombre,
    p_legacy_player_id: legacyPlayerId,
    p_legacy_liga_jugador_id: legacyLigaJugadorId,
  });

  if (error) {
    if (isMissingBlocklistError(error)) return false;
    console.warn("[riviera-jugadores] isJugadorImportBlocked:", error.message);
    return false;
  }

  return data === true;
}

/** Comprueba bloqueo por nombre normalizado (sin RPC, fallback). */
export function isNombreBlockedLocally(
  nombre: string,
  blockedNameKeys: Set<string>
): boolean {
  const key = normalizePlayerNameKey(nombre);
  return Boolean(key && blockedNameKeys.has(key));
}
