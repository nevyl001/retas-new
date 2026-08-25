import { isMissingColumnError } from "../db/schemaHelpers";
import { supabasePublicRead } from "../supabaseClient";
import {
  resolvePlayerPublicProfiles,
  type PlayerAvatarLookupEntry,
} from "../rivieraJugadores/publicPlayerAvatars";

/**
 * Fotos para jugadores de liga (liga_jugadores.id → riviera via legacy_liga_jugador_id).
 * Fallback al resolver de perfiles Riviera si no hay enlace.
 * `publicOnly` (default true) filtra visible_publico en la vista pública.
 */
export async function resolveLigaJugadorPublicFotos(
  organizadorId: string,
  entries: PlayerAvatarLookupEntry[],
  options?: { publicOnly?: boolean }
): Promise<Record<string, string | null>> {
  const publicOnly = options?.publicOnly !== false;
  const out: Record<string, string | null> = {};
  for (const e of entries) out[e.id] = null;
  if (!organizadorId.trim() || entries.length === 0) return out;

  const ids = Array.from(new Set(entries.map((e) => e.id.trim()).filter(Boolean)));
  if (!ids.length) return out;

  let q = supabasePublicRead
    .from("riviera_jugadores")
    .select("legacy_liga_jugador_id, foto_url")
    .eq("organizador_id", organizadorId)
    .in("legacy_liga_jugador_id", ids)
    .neq("estado", "archivado");

  let { data, error } = publicOnly
    ? await q.eq("visible_publico", true)
    : await q;
  if (
    publicOnly &&
    error &&
    isMissingColumnError(error, "riviera_jugadores", "visible_publico")
  ) {
    const retry = await supabasePublicRead
      .from("riviera_jugadores")
      .select("legacy_liga_jugador_id, foto_url")
      .eq("organizador_id", organizadorId)
      .in("legacy_liga_jugador_id", ids)
      .neq("estado", "archivado");
    data = retry.data;
    error = retry.error;
  }

  if (!error && data) {
    for (const row of data) {
      const ligaId = String(row.legacy_liga_jugador_id ?? "").trim();
      if (!ligaId || !(ligaId in out)) continue;
      const foto =
        typeof row.foto_url === "string" && row.foto_url.trim()
          ? row.foto_url.trim()
          : null;
      if (foto && !out[ligaId]) out[ligaId] = foto;
    }
  }

  const missing = entries.filter((e) => !out[e.id]);
  if (missing.length > 0) {
    const profiles = await resolvePlayerPublicProfiles(organizadorId, missing, {
      publicOnly,
    });
    for (const e of missing) {
      out[e.id] = profiles[e.id]?.fotoUrl ?? null;
    }
  }

  return out;
}
