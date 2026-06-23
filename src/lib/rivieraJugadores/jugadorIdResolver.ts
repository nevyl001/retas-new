import { supabase } from "../supabaseClient";
import {
  createRivieraJugador,
  ensureRivieraJugadorVisibleEnRanking,
  getRivieraJugadorByLegacyLigaId,
  getRivieraJugadorByLegacyPlayerId,
} from "./rivieraJugadoresService";
import { slugifyJugadorNombre, ensureUniqueSlug } from "./slug";

async function slugExistsForOrg(
  organizadorId: string,
  slug: string
): Promise<boolean> {
  const { data } = await supabase
    .from("riviera_jugadores")
    .select("id")
    .eq("organizador_id", organizadorId)
    .eq("slug", slug)
    .maybeSingle();
  return !!data;
}

async function finalizeJugadorIdForRanking(
  jugadorId: string | null | undefined
): Promise<string | null> {
  if (!jugadorId) return null;
  await ensureRivieraJugadorVisibleEnRanking(jugadorId);
  return jugadorId;
}

export async function getOrCreateJugadorId(params: {
  nombre: string;
  organizadorId: string;
  legacyPlayerId?: string;
  legacyLigaJugadorId?: string;
  email?: string | null;
}): Promise<string | null> {
  const nombre = params.nombre.trim();
  if (!nombre) return null;

  try {
    if (params.legacyPlayerId) {
      const byPlayer = await getRivieraJugadorByLegacyPlayerId(
        params.legacyPlayerId,
        params.organizadorId
      );
      if (byPlayer) return finalizeJugadorIdForRanking(byPlayer.id);
    }

    if (params.legacyLigaJugadorId) {
      const byLiga = await getRivieraJugadorByLegacyLigaId(
        params.legacyLigaJugadorId
      );
      if (byLiga) return finalizeJugadorIdForRanking(byLiga.id);
    }

    const { data: byName } = await supabase
      .from("riviera_jugadores")
      .select("id")
      .eq("organizador_id", params.organizadorId)
      .ilike("nombre", nombre)
      .limit(1)
      .maybeSingle();

    if (byName?.id) {
      const updates: Record<string, string> = {};
      if (params.legacyPlayerId) updates.legacy_player_id = params.legacyPlayerId;
      if (params.legacyLigaJugadorId) {
        updates.legacy_liga_jugador_id = params.legacyLigaJugadorId;
      }
      if (Object.keys(updates).length > 0) {
        await supabase
          .from("riviera_jugadores")
          .update(updates)
          .eq("id", byName.id);
      }
      return finalizeJugadorIdForRanking(byName.id);
    }

    const baseSlug = slugifyJugadorNombre(nombre);
    const slug = await ensureUniqueSlug(baseSlug, (s) =>
      slugExistsForOrg(params.organizadorId, s)
    );

    const insert: Record<string, unknown> = {
      nombre,
      slug,
      organizador_id: params.organizadorId,
      estado: "activo",
      visible_publico: true,
      email: params.email ?? null,
    };
    if (params.legacyPlayerId) insert.legacy_player_id = params.legacyPlayerId;
    if (params.legacyLigaJugadorId) {
      insert.legacy_liga_jugador_id = params.legacyLigaJugadorId;
    }

    const { data: created, error } = await supabase
      .from("riviera_jugadores")
      .insert(insert)
      .select("id")
      .single();

    if (error) {
      console.error("[riviera-jugadores] getOrCreateJugadorId insert:", error);
      const createdViaService = await createRivieraJugador(params.organizadorId, {
        nombre,
        email: params.email ?? null,
      });
      if (params.legacyPlayerId) {
        await supabase
          .from("riviera_jugadores")
          .update({ legacy_player_id: params.legacyPlayerId })
          .eq("id", createdViaService.id);
      }
      if (params.legacyLigaJugadorId) {
        await supabase
          .from("riviera_jugadores")
          .update({ legacy_liga_jugador_id: params.legacyLigaJugadorId })
          .eq("id", createdViaService.id);
      }
      return finalizeJugadorIdForRanking(createdViaService.id);
    }

    return finalizeJugadorIdForRanking(created?.id ?? null);
  } catch (e) {
    console.error("[riviera-jugadores] getOrCreateJugadorId:", e);
    return null;
  }
}
