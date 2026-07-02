import { supabase } from "../supabaseClient";
import { isJugadorImportBlocked } from "./jugadorImportBlocklist";
import {
  isRevokedGrantLocalJugador,
  resolveJugadorIdForOrganizer,
} from "./organizerPlayerAccess";
import {
  createRivieraJugador,
  ensureRivieraJugadorVisibleEnRanking,
  getRivieraJugadorByLegacyLigaId,
  getRivieraJugadorByLegacyPlayerId,
  linkLegacyPlayerId,
} from "./rivieraJugadoresService";
import { slugifyJugadorNombre, ensureUniqueSlug } from "./slug";

const TEMP_LOG_PREFIX = "TEMP_MULTICLUB_PHASE_2_1";

/** Logs temporales Fase 2.1 — fáciles de buscar y remover. */
export function logMulticlubPhase21(payload: Record<string, unknown>): void {
  console.info(TEMP_LOG_PREFIX, payload);
}

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

async function findWritableLocalJugadorId(
  organizadorId: string,
  jugadorId: string
): Promise<string | null> {
  const id = jugadorId.trim();
  if (!id) return null;

  const { data, error } = await supabase
    .from("riviera_jugadores")
    .select("id, estado")
    .eq("id", id)
    .eq("organizador_id", organizadorId)
    .maybeSingle();

  if (error || !data?.id) return null;
  if (data.estado === "archivado") return null;
  return String(data.id);
}

async function finalizeJugadorIdForRanking(
  jugadorId: string | null | undefined
): Promise<string | null> {
  if (!jugadorId) return null;
  await ensureRivieraJugadorVisibleEnRanking(jugadorId);
  return jugadorId;
}

/** Cedidos: legacy en origen → clon local del club anfitrión + enlace players. */
async function resolveLocalJugadorIdForOrganizer(
  organizadorId: string,
  rivieraJugadorId: string,
  legacyPlayerId?: string
): Promise<string | null> {
  const resolved = await resolveJugadorIdForOrganizer(
    organizadorId,
    rivieraJugadorId
  );
  const localId = await findWritableLocalJugadorId(organizadorId, resolved);
  if (!localId) return null;

  const legacy = legacyPlayerId?.trim();
  if (legacy) {
    await linkLegacyPlayerId(localId, legacy);
  }

  return finalizeJugadorIdForRanking(localId);
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

  if (
    await isJugadorImportBlocked(params.organizadorId, {
      nombre,
      legacyPlayerId: params.legacyPlayerId,
      legacyLigaJugadorId: params.legacyLigaJugadorId,
    })
  ) {
    return null;
  }

  try {
    if (params.legacyPlayerId) {
      const byPlayer = await getRivieraJugadorByLegacyPlayerId(
        params.legacyPlayerId,
        params.organizadorId
      );
      if (byPlayer) {
        const local = await resolveLocalJugadorIdForOrganizer(
          params.organizadorId,
          byPlayer.id,
          params.legacyPlayerId
        );
        if (local) return local;
      }

      // Cedido: legacy_player_id puede estar solo en el perfil origen (otro club).
      const byLegacyGlobal = await getRivieraJugadorByLegacyPlayerId(
        params.legacyPlayerId
      );
      if (byLegacyGlobal) {
        const local = await resolveLocalJugadorIdForOrganizer(
          params.organizadorId,
          byLegacyGlobal.id,
          params.legacyPlayerId
        );
        if (local) return local;
      }
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
      visible_publico: false,
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

/**
 * Resuelve el jugador operativo del organizador anfitrión antes de escribir
 * participaciones (incluye grants → local_jugador_id).
 */
export async function resolveJugadorIdForParticipacion(params: {
  organizadorId: string;
  jugadorId?: string | null;
  nombre?: string;
  legacyPlayerId?: string;
  legacyLigaJugadorId?: string;
  email?: string | null;
  tipoEvento?: string;
  eventoId?: string;
}): Promise<string | null> {
  const organizadorId = params.organizadorId.trim();
  if (!organizadorId) return null;

  const nombre = params.nombre?.trim() || "";
  const legacyPlayerId = params.legacyPlayerId?.trim();
  const legacyLigaJugadorId = params.legacyLigaJugadorId?.trim();
  const originalJugadorId = params.jugadorId?.trim() || null;

  if (
    nombre &&
    (await isJugadorImportBlocked(organizadorId, {
      nombre,
      legacyPlayerId,
      legacyLigaJugadorId,
    }))
  ) {
    return null;
  }

  let candidate: string | null = null;

  if (originalJugadorId) {
    candidate = originalJugadorId;
  } else if (nombre) {
    candidate = await getOrCreateJugadorId({
      nombre,
      organizadorId,
      legacyPlayerId,
      legacyLigaJugadorId,
      email: params.email,
    });
  }

  if (!candidate) return null;

  const resolved = await resolveJugadorIdForOrganizer(organizadorId, candidate);
  let localId = await findWritableLocalJugadorId(organizadorId, resolved);

  // Duelos/retas con UUID huérfano tras borrar el jugador del registro.
  if (!localId && nombre) {
    localId = await getOrCreateJugadorId({
      nombre,
      organizadorId,
      legacyPlayerId,
      legacyLigaJugadorId,
      email: params.email,
    });
  }

  if (!localId) return null;

  if (await isRevokedGrantLocalJugador(organizadorId, localId)) {
    return null;
  }

  const finalId = await finalizeJugadorIdForRanking(localId);

  if (finalId && finalId !== originalJugadorId) {
    logMulticlubPhase21({
      action: "identity_resolved",
      organizadorId,
      tipoEvento: params.tipoEvento ?? null,
      eventoId: params.eventoId ?? null,
      jugadorOriginal: originalJugadorId,
      jugadorResuelto: finalId,
    });
  }

  return finalId;
}
