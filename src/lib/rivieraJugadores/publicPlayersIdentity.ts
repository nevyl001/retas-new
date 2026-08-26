import type { Pair } from "../db/types";
import { supabasePublicRead } from "../supabaseClient";
import { debugLog } from "../debug/debugLog";
import {
  pairPlayer1DisplayName,
  pairPlayer2DisplayName,
} from "../pairPlayerNames";
import {
  resolvePlayerPublicProfiles,
  type PlayerAvatarLookupEntry,
  type PlayerPublicProfile,
} from "./publicPlayerAvatars";

export type PublicPlayerIdentityRef = {
  legacyPlayerId?: string | null;
  rivieraJugadorId?: string | null;
  rivieraId?: string | null;
  slug?: string | null;
  displayName?: string;
};

export type PublicPlayerIdentity = {
  legacyPlayerId: string;
  rivieraJugadorId: string | null;
  rivieraId: string | null;
  nombre: string;
  slug: string | null;
  fotoUrl: string | null;
  rating: number | null;
  nivel: string | null;
  categoria: string | null;
  mano: string | null;
  lado: string | null;
  nacionalidad: string | null;
  /** Edad desde riviera_jugadores del club (si existe). */
  edad: number | null;
};

type HostRivieraRow = {
  id?: string;
  legacy_player_id?: string | null;
  nombre?: string | null;
  slug?: string | null;
  foto_url?: unknown;
  rating?: unknown;
  nivel?: string | null;
  categoria?: string | null;
  mano_dominante?: string | null;
  en_cancha?: string | null;
  pais_codigo?: string | null;
  edad?: unknown;
};

const DEFAULT_PUBLIC_RATING = 3;

function normalizeRating(raw: unknown): number | null {
  if (raw != null && Number.isFinite(Number(raw))) {
    return Number(raw);
  }
  return null;
}

function isDefaultRating(rating: number | null | undefined): boolean {
  return rating == null || rating === DEFAULT_PUBLIC_RATING;
}

function preferRating(
  primary: number | null | undefined,
  secondary: number | null | undefined
): number | null {
  if (primary != null && !isDefaultRating(primary)) return primary;
  if (secondary != null && !isDefaultRating(secondary)) return secondary;
  return primary ?? secondary ?? null;
}

function preferFoto(
  primary: string | null | undefined,
  secondary: string | null | undefined
): string | null {
  const a = primary?.trim() || null;
  const b = secondary?.trim() || null;
  return a ?? b;
}

export function collectPublicPlayerRefsFromPairs(
  pairs: Pair[]
): PublicPlayerIdentityRef[] {
  const refs: PublicPlayerIdentityRef[] = [];
  const seen = new Set<string>();

  for (const pair of pairs) {
    const slots: Array<{ legacyId: string; name: string }> = [
      { legacyId: pair.player1_id, name: pairPlayer1DisplayName(pair) },
      { legacyId: pair.player2_id, name: pairPlayer2DisplayName(pair) },
    ];
    for (const slot of slots) {
      const legacyId = slot.legacyId?.trim();
      if (!legacyId || seen.has(legacyId)) continue;
      seen.add(legacyId);
      refs.push({ legacyPlayerId: legacyId, displayName: slot.name });
    }
  }

  return refs;
}

type PublicIdentityRpcRow = {
  legacy_player_id?: string | null;
  riviera_jugador_id?: string | null;
  nombre?: string | null;
  slug?: string | null;
  foto_url?: unknown;
  rating?: unknown;
  nivel?: string | null;
  categoria?: string | null;
  mano_dominante?: string | null;
  en_cancha?: string | null;
  pais_codigo?: string | null;
  edad?: unknown;
};

function hostRowNeedsPublicIdentityRpc(row: HostRivieraRow | undefined): boolean {
  if (!row) return true;
  const hasLado = Boolean(String(row.en_cancha ?? "").trim());
  const hasPais = Boolean(String(row.pais_codigo ?? "").trim());
  return !hasLado || !hasPais;
}

function mergeHostRivieraRow(
  current: HostRivieraRow | undefined,
  incoming: HostRivieraRow
): HostRivieraRow {
  if (!current) return incoming;
  return {
    id: current.id || incoming.id,
    legacy_player_id: current.legacy_player_id || incoming.legacy_player_id,
    nombre: current.nombre?.trim() || incoming.nombre,
    slug: current.slug?.trim() || incoming.slug,
    foto_url:
      (typeof current.foto_url === "string" && current.foto_url.trim()
        ? current.foto_url.trim()
        : null) ?? incoming.foto_url,
    rating: current.rating ?? incoming.rating,
    nivel: current.nivel?.trim() || incoming.nivel,
    categoria: current.categoria?.trim() || incoming.categoria,
    mano_dominante: current.mano_dominante?.trim() || incoming.mano_dominante,
    en_cancha: current.en_cancha?.trim() || incoming.en_cancha,
    pais_codigo: current.pais_codigo?.trim() || incoming.pais_codigo,
    edad: current.edad ?? incoming.edad,
  };
}

/**
 * SECURITY DEFINER: identidad pública cuando RLS bloquea SELECT directo
 * (ranking oficial off / visible_publico / suma_ranking).
 */
async function fetchPublicIdentityRowsByLegacy(
  organizadorId: string,
  legacyIds: string[]
): Promise<Map<string, HostRivieraRow>> {
  const map = new Map<string, HostRivieraRow>();
  const ids = Array.from(new Set(legacyIds.map((id) => id.trim()).filter(Boolean)));
  if (!organizadorId.trim() || ids.length === 0) return map;

  try {
    const { data, error } = await supabasePublicRead.rpc(
      "riviera_public_event_legacy_player_identity",
      {
        p_organizador_id: organizadorId.trim(),
        p_legacy_player_ids: ids,
      }
    );

    if (error) {
      if (
        !error.message?.includes("riviera_public_event_legacy_player_identity") &&
        !error.message?.includes("Could not find the function")
      ) {
        console.warn("[publicPlayersIdentity] identity rpc:", error.message);
      }
      return map;
    }

    for (const raw of (data ?? []) as PublicIdentityRpcRow[]) {
      const legacy = String(raw.legacy_player_id ?? "").trim();
      if (!legacy) continue;
      map.set(legacy, {
        id: String(raw.riviera_jugador_id ?? "").trim() || undefined,
        legacy_player_id: legacy,
        nombre: raw.nombre,
        slug: raw.slug,
        foto_url: raw.foto_url,
        rating: raw.rating,
        nivel: raw.nivel,
        categoria: raw.categoria,
        mano_dominante: raw.mano_dominante,
        en_cancha: raw.en_cancha,
        pais_codigo: raw.pais_codigo,
        edad: raw.edad,
      });
    }
  } catch {
    /* RPC opcional hasta desplegar el SQL */
  }

  return map;
}

async function fetchHostOrgRivieraRowsByLegacy(
  organizadorId: string,
  legacyIds: string[]
): Promise<Map<string, HostRivieraRow>> {
  const map = new Map<string, HostRivieraRow>();
  const ids = Array.from(new Set(legacyIds.map((id) => id.trim()).filter(Boolean)));
  if (!organizadorId.trim() || ids.length === 0) return map;

  const { data, error } = await supabasePublicRead
    .from("riviera_jugadores")
    .select(
      "id, legacy_player_id, nombre, slug, foto_url, rating, nivel, categoria, mano_dominante, en_cancha, pais_codigo, edad"
    )
    .eq("organizador_id", organizadorId.trim())
    .eq("estado", "activo")
    .in("legacy_player_id", ids);

  if (error) {
    console.warn("[publicPlayersIdentity] host rows:", error.message);
  } else {
    for (const row of (data ?? []) as HostRivieraRow[]) {
      const legacy = String(row.legacy_player_id ?? "").trim();
      if (legacy) map.set(legacy, row);
    }
  }

  /* También intenta por id = legacy (parejas antiguas / ids riviera). */
  const stillMissing = ids.filter((id) => !map.has(id));
  if (stillMissing.length > 0) {
    const { data: byId, error: byIdErr } = await supabasePublicRead
      .from("riviera_jugadores")
      .select(
        "id, legacy_player_id, nombre, slug, foto_url, rating, nivel, categoria, mano_dominante, en_cancha, pais_codigo, edad"
      )
      .eq("organizador_id", organizadorId.trim())
      .eq("estado", "activo")
      .in("id", stillMissing);

    if (!byIdErr && byId?.length) {
      for (const row of byId as HostRivieraRow[]) {
        const key =
          String(row.legacy_player_id ?? "").trim() ||
          String(row.id ?? "").trim();
        const requestKey = stillMissing.find(
          (id) => id === String(row.id ?? "").trim() || id === key
        );
        if (requestKey) map.set(requestKey, { ...row, legacy_player_id: requestKey });
      }
    }
  }

  const needRpc = ids.filter((id) => hostRowNeedsPublicIdentityRpc(map.get(id)));
  if (needRpc.length === 0) return map;

  const fromRpc = await fetchPublicIdentityRowsByLegacy(organizadorId, needRpc);
  fromRpc.forEach((row, legacy) => {
    map.set(legacy, mergeHostRivieraRow(map.get(legacy), row));
  });

  return map;
}

async function fetchPublicRivieraIdsByJugadorIds(
  jugadorIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = Array.from(new Set(jugadorIds.map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) return map;

  try {
    const { data, error } = await supabasePublicRead.rpc(
      "get_public_riviera_ids_for_jugadores",
      { p_jugador_ids: ids }
    );
    if (!error && data?.length) {
      for (const row of data as { jugador_id?: string; riviera_id?: string }[]) {
        const jugadorId = String(row.jugador_id ?? "").trim();
        const rivieraId = String(row.riviera_id ?? "").trim();
        if (jugadorId && rivieraId) map.set(jugadorId, rivieraId);
      }
    }
  } catch {
    /* RPC opcional */
  }

  return map;
}

function rowFotoUrl(row: HostRivieraRow | undefined): string | null {
  if (!row) return null;
  return typeof row.foto_url === "string" && row.foto_url.trim()
    ? row.foto_url.trim()
    : null;
}

function buildIdentity(
  legacyId: string,
  displayName: string,
  canonical: PlayerPublicProfile | undefined,
  hostRow: HostRivieraRow | undefined,
  rivieraId: string | null
): PublicPlayerIdentity {
  const hostRating = normalizeRating(hostRow?.rating);
  const canonicalRating = canonical?.rating ?? null;
  const rating = preferRating(hostRating, canonicalRating);
  const edadRaw = hostRow?.edad;
  const edad =
    edadRaw != null && Number.isFinite(Number(edadRaw))
      ? Number(edadRaw)
      : null;

  return {
    legacyPlayerId: legacyId,
    rivieraJugadorId: String(hostRow?.id ?? "").trim() || null,
    rivieraId,
    nombre: String(hostRow?.nombre ?? displayName).trim() || displayName,
    slug: hostRow?.slug?.trim() || null,
    fotoUrl: preferFoto(rowFotoUrl(hostRow), canonical?.fotoUrl),
    rating,
    nivel: hostRow?.nivel?.trim() || null,
    categoria: hostRow?.categoria?.trim() || null,
    mano: hostRow?.mano_dominante?.trim() || null,
    lado: hostRow?.en_cancha?.trim() || null,
    nacionalidad: hostRow?.pais_codigo?.trim() || null,
    edad,
  };
}

export function logPublicPlayerHydration(stats: {
  totalRefs: number;
  hydrated: number;
  missingAvatar: number;
  missingRating: number;
  sampleMissing: string[];
}): void {
  // debugLog ya es no-op fuera de desarrollo; mismo comportamiento que antes.
  debugLog("[public-player-hydration]", stats);
}

/**
 * Mapa ligero de identidad pública por legacy `players.id`.
 * Prioriza riviera_jugadores del club + perfil canónico (cedidos / multi-club).
 */
export async function getPublicPlayersIdentityMap(
  organizadorId: string,
  refs: PublicPlayerIdentityRef[]
): Promise<Map<string, PublicPlayerIdentity>> {
  const map = new Map<string, PublicPlayerIdentity>();
  const org = organizadorId.trim();
  if (!org || refs.length === 0) return map;

  const byLegacy = new Map<string, PublicPlayerIdentityRef>();
  for (const ref of refs) {
    const legacyId = ref.legacyPlayerId?.trim();
    if (!legacyId || byLegacy.has(legacyId)) continue;
    byLegacy.set(legacyId, ref);
  }

  const legacyIds = Array.from(byLegacy.keys());
  const entries: PlayerAvatarLookupEntry[] = legacyIds.map((legacyId) => ({
    id: legacyId,
    name: byLegacy.get(legacyId)?.displayName?.trim() ?? "",
  }));

  const [canonicalProfiles, hostRows] = await Promise.all([
    resolvePlayerPublicProfiles(org, entries, { publicOnly: true }),
    fetchHostOrgRivieraRowsByLegacy(org, legacyIds),
  ]);

  const rivieraJugadorIds = Array.from(hostRows.values())
    .map((row) => String(row.id ?? "").trim())
    .filter(Boolean);
  const rivieraIdByJugadorId = await fetchPublicRivieraIdsByJugadorIds(
    rivieraJugadorIds
  );

  let missingAvatar = 0;
  let missingRating = 0;
  const sampleMissing: string[] = [];

  for (const legacyId of legacyIds) {
    const ref = byLegacy.get(legacyId)!;
    const hostRow = hostRows.get(legacyId);
    const rivieraJugadorId = String(hostRow?.id ?? ref.rivieraJugadorId ?? "").trim();
    const rivieraId =
      ref.rivieraId?.trim() ||
      (rivieraJugadorId ? rivieraIdByJugadorId.get(rivieraJugadorId) ?? null : null);

    const identity = buildIdentity(
      legacyId,
      ref.displayName?.trim() || legacyId,
      canonicalProfiles[legacyId],
      hostRow,
      rivieraId
    );
    map.set(legacyId, identity);

    if (!identity.fotoUrl) {
      missingAvatar += 1;
      if (sampleMissing.length < 5) sampleMissing.push(identity.nombre);
    }
    if (identity.rating == null || isDefaultRating(identity.rating)) {
      missingRating += 1;
    }
  }

  logPublicPlayerHydration({
    totalRefs: legacyIds.length,
    hydrated: map.size,
    missingAvatar,
    missingRating,
    sampleMissing,
  });

  return map;
}

export function publicIdentityToResolvedRating(
  identity: PublicPlayerIdentity | undefined,
  eventRating?: number | null
): number {
  const fromEvent =
    eventRating != null && Number.isFinite(eventRating) ? eventRating : null;
  const fromIdentity = identity?.rating ?? null;

  if (fromEvent != null && !isDefaultRating(fromEvent)) return fromEvent;
  if (fromIdentity != null && !isDefaultRating(fromIdentity)) return fromIdentity;
  if (fromEvent != null) return fromEvent;
  if (fromIdentity != null) return fromIdentity;
  return DEFAULT_PUBLIC_RATING;
}
