import { supabase, supabasePublicRead } from "../supabaseClient";
import {
  isMissingRatingRpcInfrastructureError,
  shouldFallbackRatingRpcError,
  type RatingRpcFallbackOptions,
} from "./ratingRpcErrors";
import {
  listGrantedLocalJugadorIdsForSource,
  loadGrantedSourceDisplayData,
} from "./organizerPlayerAccess";
import {
  listOfficialLegacyParticipaciones,
  loadRomcOfficialPlayerView,
  romcRpcSuiteUnavailable,
  type RomcOfficialPlayerView,
} from "./rivieraOfficialActivity";
import type {
  JugadorParticipacion,
  RatingHistorialEntry,
  RivieraJugadorWithStats,
} from "./types";

export type CanonicalRatingSnapshot = {
  rating: number;
  rating_partidos: number;
  rating_fiabilidad: number;
  sourceJugadorId?: string;
  localJugadorId?: string;
};

function mergeCanonicalFromRows(
  best: CanonicalRatingSnapshot,
  rows: Array<{
    rating?: unknown;
    rating_partidos?: unknown;
    rating_fiabilidad?: unknown;
  }>
): CanonicalRatingSnapshot {
  for (const row of rows) {
    const ratingPartidos = Number(row.rating_partidos ?? 0);
    const rating = Number(row.rating ?? 3);
    const ratingFiabilidad = Number(row.rating_fiabilidad ?? 0.2);

    if (ratingPartidos > best.rating_partidos) {
      best = {
        ...best,
        rating,
        rating_partidos: ratingPartidos,
        rating_fiabilidad: ratingFiabilidad,
      };
      continue;
    }

    if (ratingPartidos === best.rating_partidos && rating > best.rating) {
      best = {
        ...best,
        rating,
        rating_fiabilidad: ratingFiabilidad,
      };
    }
  }
  return best;
}

let ratingUnifiedRpcAvailable: boolean | null = null;

function markRatingRpcUnavailable(): void {
  ratingUnifiedRpcAvailable = false;
}

function handleRatingRpcError(
  error: { code?: string; message?: string; status?: number },
  options?: RatingRpcFallbackOptions
): boolean {
  if (!shouldFallbackRatingRpcError(error, options)) {
    return false;
  }
  if (isMissingRatingRpcInfrastructureError(error)) {
    markRatingRpcUnavailable();
  }
  return true;
}

export async function discoverLinkedJugadorIds(
  jugadorId: string,
  participaciones: JugadorParticipacion[] = [],
  options?: { skipRomcLegacy?: boolean }
): Promise<string[]> {
  const ids = new Set<string>([jugadorId.trim()]);

  for (const row of participaciones) {
    const id = row.jugador_id?.trim();
    if (id) ids.add(id);
  }

  if (!options?.skipRomcLegacy && !romcRpcSuiteUnavailable()) {
    const legacy = await listOfficialLegacyParticipaciones(jugadorId, 50);
    for (const row of legacy) {
      const id = row.jugador_id?.trim();
      if (id) ids.add(id);
    }
  }

  return Array.from(ids);
}

type RatingHistorialWithPlayer = RatingHistorialEntry & { jugador_id: string };

async function fetchRatingHistorialRowsForIds(
  jugadorIds: string[],
  limite: number
): Promise<RatingHistorialWithPlayer[]> {
  if (jugadorIds.length === 0) return [];

  const fetchLimit = Math.max(limite * 3, 30);
  const { data, error } = await supabasePublicRead
    .from("rating_historial")
    .select(
      "id, jugador_id, fecha, rating_antes, rating_despues, delta, modo_juego, descripcion"
    )
    .in("jugador_id", jugadorIds)
    .order("fecha", { ascending: false })
    .limit(fetchLimit);

  if (error) {
    console.warn("[riviera-jugadores] fetchRatingHistorialRowsForIds:", error);
    return [];
  }

  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      jugador_id: String(r.jugador_id),
      fecha: String(r.fecha),
      rating_antes: Number(r.rating_antes ?? 0),
      rating_despues: Number(r.rating_despues ?? 0),
      delta: Number(r.delta ?? 0),
      modo_juego: String(r.modo_juego ?? ""),
      descripcion: String(r.descripcion ?? ""),
    };
  });
}

function toRatingHistorialEntries(
  rows: RatingHistorialWithPlayer[]
): RatingHistorialEntry[] {
  return dedupeRatingHistorial(rows);
}

async function loadCanonicalFromDiscoveredProfiles(
  jugadorIds: string[],
  historialRows: RatingHistorialWithPlayer[]
): Promise<CanonicalRatingSnapshot> {
  let best: CanonicalRatingSnapshot = {
    rating: 3,
    rating_partidos: 0,
    rating_fiabilidad: 0.2,
  };

  for (const client of [supabasePublicRead, supabase]) {
    const { data, error } = await client
      .from("riviera_jugadores")
      .select("id, rating, rating_partidos, rating_fiabilidad")
      .in("id", jugadorIds);

    if (!error && data?.length) {
      best = mergeCanonicalFromRows(best, data);
    }
  }

  if (best.rating_partidos > 0) {
    return best;
  }

  if (historialRows.length === 0) return best;

  const countByPlayer = new Map<string, number>();
  const latestByPlayer = new Map<string, RatingHistorialWithPlayer>();
  for (const row of historialRows) {
    countByPlayer.set(
      row.jugador_id,
      (countByPlayer.get(row.jugador_id) ?? 0) + 1
    );
    if (!latestByPlayer.has(row.jugador_id)) {
      latestByPlayer.set(row.jugador_id, row);
    }
  }

  let dominantId = jugadorIds[0];
  let maxCount = 0;
  for (const id of jugadorIds) {
    const count = countByPlayer.get(id) ?? 0;
    if (count > maxCount) {
      maxCount = count;
      dominantId = id;
    }
  }

  const latest = latestByPlayer.get(dominantId);
  if (!latest) return best;

  for (const client of [supabasePublicRead, supabase]) {
    const { data } = await client
      .from("riviera_jugadores")
      .select("rating, rating_partidos, rating_fiabilidad")
      .eq("id", dominantId)
      .maybeSingle();

    if (data) {
      const ratingPartidos = Number(data.rating_partidos ?? maxCount);
      return {
        rating: Number(data.rating ?? latest.rating_despues),
        rating_partidos: Math.max(ratingPartidos, maxCount),
        rating_fiabilidad: Number(data.rating_fiabilidad ?? 0.2),
        sourceJugadorId: dominantId,
      };
    }
  }

  return {
    rating: latest.rating_despues,
    rating_partidos: maxCount,
    rating_fiabilidad: Math.min(0.2 + maxCount * 0.04, 0.95),
    sourceJugadorId: dominantId,
  };
}

export async function fetchRatingCanonicoParaJugador(
  organizadorId: string,
  jugadorId: string,
  options?: RatingRpcFallbackOptions
): Promise<CanonicalRatingSnapshot | null> {
  if (ratingUnifiedRpcAvailable === false) return null;

  const org = organizadorId.trim();
  const id = jugadorId.trim();
  if (!org || !id) return null;

  const { data, error } = await supabase.rpc("riviera_rating_canonico_para_jugador", {
    p_organizador_id: org,
    p_jugador_id: id,
  });

  if (error) {
    if (handleRatingRpcError(error, options)) {
      return null;
    }
    throw error;
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;

  ratingUnifiedRpcAvailable = true;
  return {
    rating: Number(row.rating ?? 3),
    rating_partidos: Number(row.rating_partidos ?? 0),
    rating_fiabilidad: Number(row.rating_fiabilidad ?? 0.2),
    sourceJugadorId: row.source_jugador_id
      ? String(row.source_jugador_id)
      : undefined,
    localJugadorId: row.local_jugador_id
      ? String(row.local_jugador_id)
      : undefined,
  };
}

export async function fetchRatingHistorialUnificado(
  organizadorId: string,
  jugadorId: string,
  limite = 10,
  options?: RatingRpcFallbackOptions
): Promise<RatingHistorialEntry[]> {
  if (ratingUnifiedRpcAvailable === false) return [];

  const org = organizadorId.trim();
  const id = jugadorId.trim();
  if (!org || !id) return [];

  const { data, error } = await supabase.rpc("riviera_rating_historial_unificado", {
    p_organizador_id: org,
    p_jugador_id: id,
    p_limite: limite,
  });

  if (error) {
    if (handleRatingRpcError(error, options)) {
      return [];
    }
    throw error;
  }

  if ((data ?? []).length > 0) {
    ratingUnifiedRpcAvailable = true;
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    return {
      id: String(row.id),
      fecha: String(row.fecha),
      rating_antes: Number(row.rating_antes ?? 0),
      rating_despues: Number(row.rating_despues ?? 0),
      delta: Number(row.delta ?? 0),
      modo_juego: String(row.modo_juego ?? ""),
      descripcion: String(row.descripcion ?? ""),
    };
  });
}

export async function resolveLinkedJugadorIds(
  jugador: Pick<RivieraJugadorWithStats, "id" | "grantedAccess">,
  participaciones: JugadorParticipacion[] = [],
  options?: { skipRomcLegacy?: boolean }
): Promise<string[]> {
  if (jugador.grantedAccess?.sourceJugadorId?.trim()) {
    const ids = new Set<string>();
    const sourceId = jugador.grantedAccess.sourceJugadorId.trim();
    ids.add(jugador.id.trim());
    ids.add(sourceId);

    const localClones = await listGrantedLocalJugadorIdsForSource(sourceId);
    for (const localId of localClones) {
      ids.add(localId);
    }

    return Array.from(ids);
  }

  return discoverLinkedJugadorIds(jugador.id, participaciones, options);
}

function pickCanonicalJugadorId(
  jugador: Pick<RivieraJugadorWithStats, "id" | "grantedAccess">,
  linkedIds: string[]
): string {
  const granted = jugador.grantedAccess?.sourceJugadorId?.trim();
  if (granted) return granted;
  const local = jugador.id.trim();
  const remote = linkedIds.find((id) => id !== local);
  return remote ?? local;
}

export function dedupeParticipacionesById(
  rows: JugadorParticipacion[]
): JugadorParticipacion[] {
  const byId = new Map<string, JugadorParticipacion>();
  for (const row of rows) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return Array.from(byId.values()).sort(
    (a, b) =>
      b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at)
  );
}

export function dedupeRatingHistorial(
  rows: RatingHistorialEntry[]
): RatingHistorialEntry[] {
  const byId = new Map<string, RatingHistorialEntry>();
  for (const row of rows) {
    const key =
      row.id ||
      `${row.fecha}|${row.modo_juego}|${row.rating_despues}|${row.descripcion}`;
    if (!byId.has(key)) byId.set(key, row);
  }
  return Array.from(byId.values()).sort((a, b) => {
    const byFecha = b.fecha.localeCompare(a.fecha);
    if (byFecha !== 0) return byFecha;
    return b.rating_despues - a.rating_despues;
  });
}

export async function loadCanonicalRatingSnapshot(
  jugador: Pick<
    RivieraJugadorWithStats,
    "id" | "grantedAccess" | "rating" | "rating_partidos" | "rating_fiabilidad"
  >,
  options?: {
    usePublicRead?: boolean;
    organizadorId?: string | null;
    participacionesHistorial?: JugadorParticipacion[];
    rpc?: RatingRpcFallbackOptions;
  }
): Promise<CanonicalRatingSnapshot> {
  const participaciones = options?.participacionesHistorial ?? [];
  const org = options?.organizadorId?.trim();
  if (org) {
    const rpcCanon = await fetchRatingCanonicoParaJugador(
      org,
      jugador.id,
      options?.rpc
    );
    if (rpcCanon) return rpcCanon;
  }

  const sourceId = jugador.grantedAccess?.sourceJugadorId?.trim();
  if (sourceId) {
    const sourceDisplay = await loadGrantedSourceDisplayData(sourceId);
    if (sourceDisplay) {
      let best: CanonicalRatingSnapshot = {
        rating: sourceDisplay.rating,
        rating_partidos: sourceDisplay.ratingPartidos,
        rating_fiabilidad: sourceDisplay.ratingFiabilidad,
        sourceJugadorId: sourceId,
      };

      const linkedIds = await resolveLinkedJugadorIds(jugador, participaciones);
      const client = options?.usePublicRead ? supabasePublicRead : supabase;
      const { data, error } = await client
        .from("riviera_jugadores")
        .select("rating, rating_partidos, rating_fiabilidad")
        .in("id", linkedIds);

      if (!error && data?.length) {
        best = mergeCanonicalFromRows(best, data);
      }
      return best;
    }
  }

  const linkedIds = await resolveLinkedJugadorIds(jugador, participaciones);
  const historialRows = await fetchRatingHistorialRowsForIds(linkedIds, 30);
  const discovered = await loadCanonicalFromDiscoveredProfiles(
    linkedIds,
    historialRows
  );

  if (discovered.rating_partidos > 0) {
    const localId = linkedIds.find((id) => id === jugador.id.trim());
    return {
      ...discovered,
      localJugadorId: localId,
      sourceJugadorId:
        discovered.sourceJugadorId ??
        linkedIds.find((id) => id !== localId) ??
        jugador.id,
    };
  }

  let best: CanonicalRatingSnapshot = {
    rating: jugador.rating ?? 3,
    rating_partidos: jugador.rating_partidos ?? 0,
    rating_fiabilidad: jugador.rating_fiabilidad ?? 0.2,
    sourceJugadorId: sourceId,
  };

  const client = options?.usePublicRead ? supabasePublicRead : supabase;
  const { data, error } = await client
    .from("riviera_jugadores")
    .select("rating, rating_partidos, rating_fiabilidad")
    .in("id", linkedIds);

  if (error) {
    console.warn("[riviera-jugadores] loadCanonicalRatingSnapshot:", error);
    return best;
  }

  return mergeCanonicalFromRows(best, data ?? []);
}

export function applyUnifiedRatingFieldsToJugador(
  jugador: RivieraJugadorWithStats,
  historial: RatingHistorialEntry[],
  canonical?: CanonicalRatingSnapshot
): RivieraJugadorWithStats {
  void historial;
  const canon: CanonicalRatingSnapshot = canonical ?? {
    rating: jugador.rating ?? 3,
    rating_partidos: jugador.rating_partidos ?? 0,
    rating_fiabilidad: jugador.rating_fiabilidad ?? 0.2,
  };

  return {
    ...jugador,
    rating: canon.rating,
    rating_partidos: canon.rating_partidos,
    rating_fiabilidad: canon.rating_fiabilidad,
  };
}

export interface UnifiedJugadorParticipacionesView {
  historial: JugadorParticipacion[];
  romcView: RomcOfficialPlayerView;
  linkedJugadorIds: string[];
}

export async function loadUnifiedParticipacionesForJugador(
  jugador: RivieraJugadorWithStats,
  options: {
    limit?: number;
    organizadorId?: string | null;
    listParticipaciones: (
      jugadorId: string,
      limit: number,
      organizadorId?: string | null
    ) => Promise<JugadorParticipacion[]>;
  }
): Promise<UnifiedJugadorParticipacionesView> {
  const limit = options.limit ?? 100;
  const linkedJugadorIds = await resolveLinkedJugadorIds(jugador, [], {
    skipRomcLegacy: true,
  });
  const canonicalId = pickCanonicalJugadorId(jugador, linkedJugadorIds);

  const lists = await Promise.all(
    linkedJugadorIds.map((id) =>
      options.listParticipaciones(id, limit, options.organizadorId ?? null)
    )
  );
  const mergedLocal = dedupeParticipacionesById(lists.flat());
  const linkedResolved = await resolveLinkedJugadorIds(jugador, mergedLocal, {
    skipRomcLegacy: true,
  });

  const romcView = romcRpcSuiteUnavailable()
    ? {
        historial: mergedLocal,
        puntosOficiales: null,
        hasRomcData: false,
      }
    : await loadRomcOfficialPlayerView(canonicalId, {
        localParticipaciones: mergedLocal,
        limit,
      });

  const historial = romcView.hasRomcData ? romcView.historial : mergedLocal;

  return { historial, romcView, linkedJugadorIds: linkedResolved };
}

export async function loadUnifiedRatingHistorialForJugador(
  jugador: RivieraJugadorWithStats,
  options: {
    limite?: number;
    organizadorId?: string | null;
    participacionesHistorial?: JugadorParticipacion[];
    fetchHistorial: (jugadorId: string, limite: number) => Promise<RatingHistorialEntry[]>;
    rpc?: RatingRpcFallbackOptions;
  }
): Promise<RatingHistorialEntry[]> {
  const limite = options.limite ?? 10;
  const participaciones = options.participacionesHistorial ?? [];
  const org = options.organizadorId?.trim();
  if (org) {
    const rpcHistorial = await fetchRatingHistorialUnificado(
      org,
      jugador.id,
      limite,
      options.rpc
    );
    if (rpcHistorial.length > 0) return rpcHistorial;
  }

  const linkedJugadorIds = await resolveLinkedJugadorIds(jugador, participaciones);
  const publicRows = await fetchRatingHistorialRowsForIds(linkedJugadorIds, limite);
  if (publicRows.length > 0) {
    return toRatingHistorialEntries(publicRows).slice(0, limite);
  }

  const fetchLimit = Math.max(limite * 3, 30);
  const lists = await Promise.all(
    linkedJugadorIds.map((id) => options.fetchHistorial(id, fetchLimit))
  );
  return dedupeRatingHistorial(lists.flat()).slice(0, limite);
}

export async function loadUnifiedRatingViewForJugador(
  jugador: RivieraJugadorWithStats,
  options: {
    limite?: number;
    organizadorId?: string | null;
    participacionesHistorial?: JugadorParticipacion[];
    fetchHistorial: (jugadorId: string, limite: number) => Promise<RatingHistorialEntry[]>;
    usePublicRead?: boolean;
    rpc?: RatingRpcFallbackOptions;
  }
): Promise<{ historial: RatingHistorialEntry[]; jugador: RivieraJugadorWithStats }> {
  const participaciones = options.participacionesHistorial ?? [];
  const canonical = await loadCanonicalRatingSnapshot(jugador, {
    usePublicRead: options.usePublicRead,
    organizadorId: options.organizadorId,
    participacionesHistorial: participaciones,
    rpc: options.rpc,
  });
  const historial = await loadUnifiedRatingHistorialForJugador(jugador, options);

  return {
    historial,
    jugador: applyUnifiedRatingFieldsToJugador(jugador, historial, canonical),
  };
}
