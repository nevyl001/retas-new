import { supabase } from "../supabaseClient";
import { isJugadorImportBlocked } from "./jugadorImportBlocklist";
import {
  isRevokedGrantLocalJugador,
  listActiveGrantedAccessForOrganizer,
  prepareGrantedPlayersForParticipacionSync,
  resolveJugadorIdForOrganizer,
  ensureGrantedPlayerLocal,
} from "./organizerPlayerAccess";
import {
  createRivieraJugador,
  ensureRivieraJugadorVisibleEnRanking,
  getRivieraJugadorByLegacyLigaId,
  getRivieraJugadorByLegacyPlayerId,
  linkLegacyPlayerId,
  listRivieraJugadoresByLegacyPlayerId,
} from "./rivieraJugadoresService";
import { ensureRivieraIdentity } from "./careerIdentity";
import {
  requireOfficialProfileLinkForParticipacion,
} from "./orphanProfileLink";
import {
  CareerIntegrityException,
  isCareerIntegrityException,
} from "./careerIntegrity";
import { slugifyJugadorNombre, ensureUniqueSlug } from "./slug";

import { debugWarn } from "../debug/debugLog";

const TEMP_LOG_PREFIX = "TEMP_MULTICLUB_PHASE_2_1";

/**
 * Audit trail temporal Fase 2.1 — solo desarrollo (no producción).
 */
export function logMulticlubPhase21(payload: Record<string, unknown>): void {
  debugWarn(TEMP_LOG_PREFIX, payload);
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

function failClosedExplicitJugadorId(
  organizadorId: string,
  jugadorId: string,
  reason: string
): never {
  throw new CareerIntegrityException({
    code: "missing_riviera_id",
    message: `Identidad explícita no resoluble: ${reason}`,
    confidence: "LOW",
    reason,
    actionSugerida: "Corregir riviera_jugador_id o reasignar el jugador con un ID fuerte",
    jugadorId,
    organizadorId,
    details: { via: "explicit_riviera_jugador_id", failClosed: true },
  });
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

/** players.id de la reta → clon local del club anfitrión (cedidos incluidos). */
export async function resolveLocalJugadorIdByLegacyPlayerId(
  organizadorId: string,
  legacyPlayerId: string
): Promise<string | null> {
  const org = organizadorId.trim();
  const legacy = legacyPlayerId.trim();
  if (!org || !legacy) return null;

  const finalizeLocal = async (rivieraRowId: string): Promise<string | null> => {
    const resolved = await resolveJugadorIdForOrganizer(org, rivieraRowId);
    const localId = await findWritableLocalJugadorId(org, resolved);
    if (!localId) return null;
    await linkLegacyPlayerId(localId, legacy);
    return finalizeJugadorIdForRanking(localId);
  };

  const localRows = await listRivieraJugadoresByLegacyPlayerId(legacy, org);
  for (const row of localRows) {
    const id = await finalizeLocal(row.id);
    if (id) return id;
  }

  const grants = await listActiveGrantedAccessForOrganizer(org);
  for (const grant of grants) {
    const sourceId = grant.jugador_id.trim();
    if (!sourceId) continue;

    const [{ data: source }, localProfile] = await Promise.all([
      supabase
        .from("riviera_jugadores")
        .select("legacy_player_id")
        .eq("id", sourceId)
        .maybeSingle(),
      grant.local_jugador_id
        ? supabase
            .from("riviera_jugadores")
            .select("legacy_player_id")
            .eq("id", grant.local_jugador_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    const sourceLegacy = source?.legacy_player_id?.trim() ?? "";
    const localLegacy = localProfile.data?.legacy_player_id?.trim() ?? "";
    if (sourceLegacy !== legacy && localLegacy !== legacy) continue;

    let localId = grant.local_jugador_id?.trim() || null;
    if (!localId) {
      localId = await ensureGrantedPlayerLocal(sourceId);
    }
    const writable = await findWritableLocalJugadorId(org, localId);
    if (!writable) continue;
    await linkLegacyPlayerId(writable, legacy);
    return finalizeJugadorIdForRanking(writable);
  }

  const globalRows = await listRivieraJugadoresByLegacyPlayerId(legacy);
  const preferred =
    globalRows.find((row) => row.organizador_id === org) ??
    globalRows.find((row) => row.organizador_id !== org) ??
    globalRows[0];
  if (preferred) {
    return finalizeLocal(preferred.id);
  }

  return null;
}

export async function prepareParticipacionIdentityForOrganizer(
  organizadorId: string
): Promise<void> {
  await prepareGrantedPlayersForParticipacionSync(organizadorId);
}

/**
 * Resuelve o crea identidad únicamente con claves fuertes.
 * Nombre es solo etiqueta de presentación al crear (nunca clave de match).
 *
 * Política C:
 * - con legacy_player_id / legacy_liga_jugador_id no resuelto → crear ligado a esa clave;
 * - sin ninguna clave fuerte → null (unresolved / fail-closed en cierre-sync).
 */
export async function getOrCreateJugadorId(params: {
  nombre: string;
  organizadorId: string;
  legacyPlayerId?: string;
  legacyLigaJugadorId?: string;
  email?: string | null;
}): Promise<string | null> {
  const nombre = params.nombre.trim() || "Jugador";
  const legacyPlayerId = params.legacyPlayerId?.trim() || undefined;
  const legacyLigaJugadorId = params.legacyLigaJugadorId?.trim() || undefined;

  if (!legacyPlayerId && !legacyLigaJugadorId) {
    return null;
  }

  if (
    await isJugadorImportBlocked(params.organizadorId, {
      nombre,
      legacyPlayerId,
      legacyLigaJugadorId,
    })
  ) {
    return null;
  }

  try {
    if (legacyPlayerId) {
      const byPlayer = await getRivieraJugadorByLegacyPlayerId(
        legacyPlayerId,
        params.organizadorId
      );
      if (byPlayer) {
        const local = await resolveLocalJugadorIdForOrganizer(
          params.organizadorId,
          byPlayer.id,
          legacyPlayerId
        );
        if (local) return local;
      }

      const byLegacyGlobal = await getRivieraJugadorByLegacyPlayerId(
        legacyPlayerId,
        undefined,
        { preferExcludingOrganizadorId: params.organizadorId }
      );
      if (byLegacyGlobal) {
        const local = await resolveLocalJugadorIdForOrganizer(
          params.organizadorId,
          byLegacyGlobal.id,
          legacyPlayerId
        );
        if (local) return local;
      }
    }

    if (legacyLigaJugadorId) {
      const byLiga = await getRivieraJugadorByLegacyLigaId(legacyLigaJugadorId);
      if (byLiga) return finalizeJugadorIdForRanking(byLiga.id);
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
    if (legacyPlayerId) insert.legacy_player_id = legacyPlayerId;
    if (legacyLigaJugadorId) {
      insert.legacy_liga_jugador_id = legacyLigaJugadorId;
    }

    const { data: created, error } = await supabase
      .from("riviera_jugadores")
      .insert(insert)
      .select("id")
      .single();

    if (error) {
      // Idempotencia: carrera o unique en legacy → re-resolver por clave fuerte.
      if (legacyPlayerId) {
        const again = await getRivieraJugadorByLegacyPlayerId(
          legacyPlayerId,
          params.organizadorId
        );
        if (again) {
          const local = await resolveLocalJugadorIdForOrganizer(
            params.organizadorId,
            again.id,
            legacyPlayerId
          );
          if (local) return local;
        }
      }
      if (legacyLigaJugadorId) {
        const againLiga = await getRivieraJugadorByLegacyLigaId(
          legacyLigaJugadorId
        );
        if (againLiga) return finalizeJugadorIdForRanking(againLiga.id);
      }

      console.error("[riviera-jugadores] getOrCreateJugadorId insert:", error);
      const createdViaService = await createRivieraJugador(
        params.organizadorId,
        { nombre, email: params.email ?? null },
        { skipEmailRequirement: true }
      );
      if (legacyPlayerId) {
        await supabase
          .from("riviera_jugadores")
          .update({ legacy_player_id: legacyPlayerId })
          .eq("id", createdViaService.id);
      }
      if (legacyLigaJugadorId) {
        await supabase
          .from("riviera_jugadores")
          .update({ legacy_liga_jugador_id: legacyLigaJugadorId })
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

export type ResolveJugadorIdForParticipacionParams = {
  organizadorId: string;
  jugadorId?: string | null;
  nombre?: string;
  legacyPlayerId?: string;
  legacyLigaJugadorId?: string;
  email?: string | null;
  tipoEvento?: string;
  eventoId?: string;
};

async function finalizeResolvedParticipacionId(
  localId: string,
  organizadorId: string,
  params: ResolveJugadorIdForParticipacionParams,
  originalJugadorId: string | null
): Promise<string | null> {
  if (await isRevokedGrantLocalJugador(organizadorId, localId)) {
    return null;
  }

  const finalId = await finalizeJugadorIdForRanking(localId);

  if (finalId) {
    try {
      await ensureRivieraIdentity(finalId);
      const linkResult = await requireOfficialProfileLinkForParticipacion(
        finalId,
        organizadorId
      );
      if (linkResult?.linkCreated) {
        logMulticlubPhase21({
          action: "orphan_profile_linked",
          organizadorId,
          tipoEvento: params.tipoEvento ?? null,
          eventoId: params.eventoId ?? null,
          jugadorId: finalId,
          rivieraId: linkResult.rivieraId ?? null,
          officialPlayerKey: linkResult.officialPlayerKey ?? null,
          confidence: linkResult.confidence,
        });
      }
    } catch (e) {
      if (isCareerIntegrityException(e)) {
        console.error(
          "[riviera-jugadores] career_integrity_blocked",
          e.toStructuredLog()
        );
        throw e;
      }
      console.warn("[riviera-jugadores] identity/link guard:", e);
      throw e;
    }
  }

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

/**
 * Resuelve el jugador operativo del organizador anfitrión antes de escribir
 * participaciones. Orden: ID explícito → legacy_player → legacy_liga → create
 * por legacy → unresolved. Cero resolución por nombre.
 */
export async function resolveJugadorIdForParticipacion(
  params: ResolveJugadorIdForParticipacionParams
): Promise<string | null> {
  const organizadorId = params.organizadorId.trim();
  if (!organizadorId) return null;

  const nombre = params.nombre?.trim() || "";
  const legacyPlayerId = params.legacyPlayerId?.trim() || undefined;
  const legacyLigaJugadorId = params.legacyLigaJugadorId?.trim() || undefined;
  const originalJugadorId = params.jugadorId?.trim() || null;

  // 1) riviera_jugador_id explícito — fail-closed si no es writable.
  if (originalJugadorId) {
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

    const resolved = await resolveJugadorIdForOrganizer(
      organizadorId,
      originalJugadorId
    );
    const localId = await findWritableLocalJugadorId(organizadorId, resolved);
    if (!localId) {
      failClosedExplicitJugadorId(
        organizadorId,
        originalJugadorId,
        "riviera_jugador_id explícito inválido, inaccesible o no writable en el organizador"
      );
    }

    return finalizeResolvedParticipacionId(
      localId,
      organizadorId,
      params,
      originalJugadorId
    );
  }

  // 2) legacy_player_id
  if (legacyPlayerId) {
    const byLegacy = await resolveLocalJugadorIdByLegacyPlayerId(
      organizadorId,
      legacyPlayerId
    );
    if (byLegacy) {
      return finalizeResolvedParticipacionId(
        byLegacy,
        organizadorId,
        params,
        originalJugadorId
      );
    }
  }

  // 3) legacy_liga_jugador_id (vía getOrCreate: resolve o create ligado al legacy)
  // 4–6) create por clave fuerte / unresolved — sin nombre como identidad
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

  if (!legacyPlayerId && !legacyLigaJugadorId) {
    return null;
  }

  const createdOrResolved = await getOrCreateJugadorId({
    nombre: nombre || "Jugador",
    organizadorId,
    legacyPlayerId,
    legacyLigaJugadorId,
    email: params.email,
  });

  if (!createdOrResolved) return null;

  const resolved = await resolveJugadorIdForOrganizer(
    organizadorId,
    createdOrResolved
  );
  const localId = await findWritableLocalJugadorId(organizadorId, resolved);
  if (!localId) return null;

  return finalizeResolvedParticipacionId(
    localId,
    organizadorId,
    params,
    originalJugadorId
  );
}
