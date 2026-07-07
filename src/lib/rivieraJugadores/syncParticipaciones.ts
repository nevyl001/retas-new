import type { Match, Pair, Tournament } from "../db/types";
import type { AmericanoPlayer, AmericanoRound } from "../db/types";
import { getGames, getMatches, getPairs, getTournaments } from "../database";
import { computeJornadaPublicStats } from "../liga/jornadaStats";
import { formatLugarOrdinal } from "./historialDisplay";
import { getOrganizerDisplayNameSync } from "../organizer/organizerDisplayName";
import { supabase } from "../supabaseClient";
import { rebuildAmericanoFromSnapshot } from "../americanoSnapshotRoster";
import {
  buildAmericanoPlayerStandingStats,
  getAmericanoRanking,
} from "../americanoStandings";
import {
  fetchAmericanoLivePublic,
  type FetchAmericanoLivePublicResult,
} from "../database";
import { isAmericanoTournament } from "../gameModeMapping";
import { loadAmericanoDinamicoSnapshot } from "../americanoDinamicoStorage";
import { fetchTorneoExpressBundle } from "../../services/torneoExpressService";
import { getLigaById } from "../../services/ligaService";
import {
  eliminatoriaBracketSize,
  isRondaTercerLugar,
  partidosDeRonda,
  totalRondasEliminatoria,
} from "../torneoExpress/bracketRounds";
import { clasificadosPairIdsFromBundle } from "../torneoExpress/clasificadosPairs";
import type { TorneoExpressBundle } from "../torneoExpress/types";
import type { TorneoExpressEliminatoriaPartido } from "../torneoExpress/types";
import {
  calcularPuntosEventoDesglose,
  RANKING_PUNTOS_ESQUEMA,
  type CalcularPuntosEventoParams,
  type PuntosDesglose,
  type RivieraRankingFormato,
} from "./rivieraRankingPoints";
import {
  computePairsWithStats,
  sortPairsForStandings,
  computeTeamStandings,
  getMatchScoresForStandings,
  getTeamConfigFromStorage,
} from "../standingsUtils";
import { matchesForStandingsTable } from "../resolveTournamentOutcome";
import {
  loadChampionshipConfig,
  partitionMatches,
  resolveChampionshipPodium,
  resolveRegularRoundsMax,
} from "../roundRobinChampionship";
import {
  adjustRankingPuntosManual,
  ensureRivieraJugadorVisibleEnRanking,
  rebuildJugadorStats,
  registrarParticipacion,
} from "./rivieraJugadoresService";
import { tryWriteRivieraOfficialLedger } from "./rivieraOfficialLedger";
import type { JugadorResultado, JugadorTipoEvento } from "./types";
import type { Duelo2v2 } from "../duelo2v2/types";
import {
  buildPartidosDetalleByLegacyPlayerId,
  loadGamesByMatchId,
} from "./buildRetaPartidosDetalle";
import { buildAmericanoPartidosDetalleForPlayer } from "./buildAmericanoPartidosDetalle";
import { buildDuelo2vs2PartidosDetalle } from "./buildDuelo2vs2PartidosDetalle";
import { buildLigaJornadaPartidosDetalleByJugadorId } from "./buildLigaJornadaPartidosDetalle";
import {
  logMulticlubPhase21,
  prepareParticipacionIdentityForOrganizer,
} from "./jugadorIdResolver";
import {
  resolveJugadorForEventSync,
  runPlayerParticipacionSync,
  toExcludedJugadorIdSet,
} from "./careerEventPipeline/careerEventPlayerSync";
import type { CareerEventAssertionFailure } from "./careerEventPipeline/types";
import { repairRetaPairLegacyPlayerIds } from "./repairRetaPairLegacyIds";
import { isParticipacionExcluded } from "./participacionExclusions";
import {
  aplicarRatingDuelo2v2,
  aplicarRatingRetaFinishedMatches,
  resolveDuelo2v2RatingPlayerIds,
} from "./aplicarRatingPartido";
import {
  enrichMetadataWithPartidosDetalle,
  mergeMetadataWithPartidosDetalle,
  parsePartidosDetalle,
  summarizePartidosDetalle,
  type PartidoDetalle,
} from "../shared/buildPartidosDetalle";

const TEMP_POINTS_LOG_PREFIX = "TEMP_MULTICLUB_POINTS_2_1_B";

function logMulticlubPoints21B(payload: Record<string, unknown>): void {
  console.info(TEMP_POINTS_LOG_PREFIX, payload);
}

async function readJugadorSumaRankingState(jugadorId: string): Promise<{
  sumaRanking: boolean;
  estado: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from("riviera_jugadores")
      .select("suma_ranking, estado")
      .eq("id", jugadorId)
      .maybeSingle();

    if (error || !data) {
      return { sumaRanking: true, estado: null };
    }

    return {
      sumaRanking:
        data.estado !== "archivado" &&
        (data as { suma_ranking?: boolean }).suma_ranking !== false,
      estado: (data.estado as string | null) ?? null,
    };
  } catch {
    return { sumaRanking: true, estado: null };
  }
}

const PAIRS_SELECT =
  "id, tournament_id, player1_id, player2_id, player1_name, player2_name, created_at";

type PlayerAgg = {
  wins: number;
  losses: number;
  draws: number;
  setsFavor: number;
  setsContra: number;
  puntosObtenidos: number;
  nombre: string;
  legacyPlayerId?: string;
  legacyLigaJugadorId?: string;
  email?: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function yaRegistrada(
  jugadorId: string,
  eventoId: string,
  tipoEvento: JugadorTipoEvento
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("jugador_participaciones")
      .select("id")
      .eq("jugador_id", jugadorId)
      .eq("evento_id", eventoId)
      .eq("tipo_evento", tipoEvento)
      .limit(1)
      .maybeSingle();

    if (error) {
      const msg = (error.message ?? "").toLowerCase();
      if (
        error.code === "42P01" ||
        error.code === "PGRST205" ||
        msg.includes("jugador_participaciones")
      ) {
        return false;
      }
      console.error("[riviera-jugadores] yaRegistrada:", error);
      return false;
    }
    return !!data;
  } catch (e) {
    console.error("[riviera-jugadores] yaRegistrada:", e);
    return false;
  }
}

export { getOrCreateJugadorId } from "./jugadorIdResolver";

async function tieneParticipacionSubtipo(
  jugadorId: string,
  tipoEvento: JugadorTipoEvento,
  eventoId: string,
  subtipo: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("jugador_participaciones")
      .select("id")
      .eq("jugador_id", jugadorId)
      .eq("tipo_evento", tipoEvento)
      .eq("evento_id", eventoId)
      .filter("metadata->>subtipo", "eq", subtipo)
      .limit(1)
      .maybeSingle();
    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
}

function rankingMetadata(
  desglose: PuntosDesglose,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  const total = Object.values(desglose).reduce((a, b) => a + b, 0);
  return {
    ...extra,
    puntos_aplicados: true,
    puntos_desglose: desglose,
    puntos_evento: total,
    ranking_puntos_esquema: RANKING_PUNTOS_ESQUEMA,
  };
}

/** Resultado estándar de sync para el pipeline canónico de carrera. */
export type CareerEventSyncOutcome = {
  touchedJugadorIds: string[];
  /** evento_id en jugador_participaciones (puede diferir del id lógico del evento). */
  participacionEventoId?: string;
  /** Fallos aislados por jugador durante el sync (no abortan al resto). */
  syncFailures?: import("./careerEventPipeline/types").CareerEventAssertionFailure[];
};

export type CareerEventSyncOptions = {
  excludeJugadorIds?: string[];
};

export async function collectJugadorIdsForCareerEvent(
  tipoEvento: JugadorTipoEvento,
  eventoId: string
): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from("jugador_participaciones")
      .select("jugador_id")
      .eq("tipo_evento", tipoEvento)
      .eq("evento_id", eventoId);
    if (error || !data?.length) return [];
    return Array.from(
      new Set(data.map((r) => String((r as { jugador_id: string }).jugador_id)))
    );
  } catch {
    return [];
  }
}

function hostClubMetadata(organizadorId: string): Record<string, string> {
  return {
    organizador_id: organizadorId,
    club_name: getOrganizerDisplayNameSync(organizadorId),
  };
}

async function registrarPuntosRanking(params: {
  jugadorId: string;
  tipoEvento: JugadorTipoEvento;
  eventoId: string;
  eventoNombre: string;
  resultado: JugadorResultado;
  formato: RivieraRankingFormato;
  calcParams: Omit<CalcularPuntosEventoParams, "formato">;
  setsFavor?: number;
  setsContra?: number;
  parejaCon?: string;
  metadata?: Record<string, unknown>;
  skipIfSubtipoExists?: string;
  upsertSubtipo?: string;
}): Promise<void> {
  if (await isParticipacionExcluded(params.jugadorId, params.tipoEvento, params.eventoId)) {
    return;
  }

  if (params.skipIfSubtipoExists) {
    const exists = await tieneParticipacionSubtipo(
      params.jugadorId,
      params.tipoEvento,
      params.eventoId,
      params.skipIfSubtipoExists
    );
    if (exists) return;
  }

  const { total, desglose } = calcularPuntosEventoDesglose({
    formato: params.formato,
    ...params.calcParams,
  });

  const subtipoForLog =
    params.upsertSubtipo ??
    (typeof params.metadata?.subtipo === "string"
      ? params.metadata.subtipo
      : null);

  logMulticlubPoints21B({
    action: "puntos_calculados",
    jugadorId: params.jugadorId,
    puntosCalculados: total,
    desglose,
    tipoEvento: params.tipoEvento,
    eventoId: params.eventoId,
    subtipo: subtipoForLog,
  });

  const metadata = rankingMetadata(desglose, params.metadata);
  const subtipo =
    params.upsertSubtipo ??
    (typeof params.metadata?.subtipo === "string"
      ? params.metadata.subtipo
      : undefined);

  if (subtipo) {
    await upsertParticipacionRanking({
      jugadorId: params.jugadorId,
      tipoEvento: params.tipoEvento,
      eventoId: params.eventoId,
      eventoNombre: params.eventoNombre,
      resultado: params.resultado,
      subtipo,
      setsFavor: params.setsFavor,
      setsContra: params.setsContra,
      puntosObtenidos: total,
      parejaCon: params.parejaCon,
      metadata,
    });
    return;
  }

  await safeRegistrar({
    jugadorId: params.jugadorId,
    tipoEvento: params.tipoEvento,
    eventoId: params.eventoId,
    eventoNombre: params.eventoNombre,
    resultado: params.resultado,
    setsFavor: params.setsFavor,
    setsContra: params.setsContra,
    puntosObtenidos: total,
    parejaCon: params.parejaCon,
    metadata,
  });
}

async function safeRegistrar(params: {
  jugadorId: string;
  tipoEvento: JugadorTipoEvento;
  eventoId: string;
  eventoNombre: string;
  resultado: JugadorResultado;
  setsFavor?: number;
  setsContra?: number;
  puntosObtenidos?: number;
  parejaCon?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (await isParticipacionExcluded(params.jugadorId, params.tipoEvento, params.eventoId)) {
    return;
  }

  try {
    const rankingState = await readJugadorSumaRankingState(params.jugadorId);
    const puntosCalculados = Math.max(0, params.puntosObtenidos ?? 0);
    const puntos = rankingState.sumaRanking ? puntosCalculados : 0;
    const subtipo =
      typeof params.metadata?.subtipo === "string"
        ? params.metadata.subtipo
        : null;

    logMulticlubPoints21B({
      action: "safe_registrar_gate",
      jugadorId: params.jugadorId,
      sumaRanking: rankingState.sumaRanking,
      estado: rankingState.estado,
      puntosCalculados,
      puntosFinales: puntos,
      subtipo,
      eventoId: params.eventoId,
      tipoEvento: params.tipoEvento,
    });

    const participacionId = await registrarParticipacion({
      ...params,
      puntosObtenidos: puntos,
    });
    if (participacionId) {
      await tryWriteRivieraOfficialLedger(participacionId);
      logMulticlubPhase21({
        action: "participacion_inserted",
        participacionId,
        jugadorId: params.jugadorId,
        tipoEvento: params.tipoEvento,
        eventoId: params.eventoId,
      });
    }
    if (rankingState.sumaRanking) {
      await ensureRivieraJugadorVisibleEnRanking(params.jugadorId);
    }
  } catch (e) {
    const msg =
      e && typeof e === "object" && "message" in e
        ? String((e as { message?: string }).message ?? "")
        : "";
    if (msg.includes("No autorizado para registrar participación")) {
      return;
    }
    console.error("[riviera-jugadores] safeRegistrar:", e);
  }
}

async function getParticipacionBySubtipo(
  jugadorId: string,
  tipoEvento: JugadorTipoEvento,
  eventoId: string,
  subtipo: string
): Promise<{
  id: string;
  puntos_obtenidos: number | null;
  metadata: Record<string, unknown> | null;
  sets_favor: number | null;
  sets_contra: number | null;
  resultado: JugadorResultado | null;
  pareja_con: string | null;
} | null> {
  try {
    const { data, error } = await supabase
      .from("jugador_participaciones")
      .select(
        "id, puntos_obtenidos, metadata, sets_favor, sets_contra, resultado, pareja_con"
      )
      .eq("jugador_id", jugadorId)
      .eq("tipo_evento", tipoEvento)
      .eq("evento_id", eventoId)
      .filter("metadata->>subtipo", "eq", subtipo)
      .maybeSingle();
    if (error || !data) return null;
    return data as {
      id: string;
      puntos_obtenidos: number | null;
      metadata: Record<string, unknown> | null;
      sets_favor: number | null;
      sets_contra: number | null;
      resultado: JugadorResultado | null;
      pareja_con: string | null;
    };
  } catch {
    return null;
  }
}

async function upsertParticipacionRanking(params: {
  jugadorId: string;
  tipoEvento: JugadorTipoEvento;
  eventoId: string;
  eventoNombre: string;
  resultado: JugadorResultado;
  subtipo: string;
  setsFavor?: number;
  setsContra?: number;
  puntosObtenidos: number;
  parejaCon?: string;
  metadata: Record<string, unknown>;
  force?: boolean;
}): Promise<void> {
  if (await isParticipacionExcluded(params.jugadorId, params.tipoEvento, params.eventoId)) {
    return;
  }

  const incomingDetalle = parsePartidosDetalle(params.metadata.partidos_detalle);
  const existing = await getParticipacionBySubtipo(
    params.jugadorId,
    params.tipoEvento,
    params.eventoId,
    params.subtipo
  );

  const mergedMeta = mergeMetadataWithPartidosDetalle(
    existing?.metadata,
    params.metadata,
    incomingDetalle,
    { force: params.force }
  );
  const detSummary = summarizePartidosDetalle(
    parsePartidosDetalle(mergedMeta.partidos_detalle)
  );
  const setsFavor =
    detSummary.jugados > 0
      ? detSummary.setsFavor
      : (params.setsFavor ?? existing?.sets_favor ?? 0);
  const setsContra =
    detSummary.jugados > 0
      ? detSummary.setsContra
      : (params.setsContra ?? existing?.sets_contra ?? 0);
  const rankingState = await readJugadorSumaRankingState(params.jugadorId);
  const puntosCalculados = params.puntosObtenidos;
  const puntosObtenidos = rankingState.sumaRanking ? puntosCalculados : 0;

  logMulticlubPoints21B({
    action: existing ? "upsert_update_gate" : "upsert_insert_gate",
    jugadorId: params.jugadorId,
    sumaRanking: rankingState.sumaRanking,
    estado: rankingState.estado,
    puntosCalculados,
    puntosFinales: puntosObtenidos,
    subtipo: params.subtipo,
    eventoId: params.eventoId,
    tipoEvento: params.tipoEvento,
  });

  if (existing) {
    const { error } = await supabase
      .from("jugador_participaciones")
      .update({
        evento_nombre: params.eventoNombre,
        resultado: params.resultado,
        sets_favor: setsFavor,
        sets_contra: setsContra,
        puntos_obtenidos: puntosObtenidos,
        pareja_con: params.parejaCon ?? existing.pareja_con,
        metadata: mergedMeta,
      })
      .eq("id", existing.id);
    if (error) {
      console.error("[riviera-jugadores] upsertParticipacionRanking:", error);
      return;
    }
    logMulticlubPhase21({
      action: "participacion_updated",
      participacionId: existing.id,
      jugadorId: params.jugadorId,
      tipoEvento: params.tipoEvento,
      eventoId: params.eventoId,
    });
    await tryWriteRivieraOfficialLedger(existing.id);
    return;
  }

  await safeRegistrar({
    jugadorId: params.jugadorId,
    tipoEvento: params.tipoEvento,
    eventoId: params.eventoId,
    eventoNombre: params.eventoNombre,
    resultado: params.resultado,
    setsFavor,
    setsContra,
    puntosObtenidos,
    parejaCon: params.parejaCon,
    metadata: mergedMeta,
  });
}

/** Persiste snapshot inmutable con merge de partidos_detalle (no sobrescribe si ya hay filas). */
export async function persistParticipacionSnapshot(params: {
  jugadorId: string;
  tipoEvento: JugadorTipoEvento;
  eventoId: string;
  eventoNombre: string;
  resultado: JugadorResultado;
  subtipo: string;
  metadata: Record<string, unknown>;
  partidosDetalle?: PartidoDetalle[];
  setsFavor?: number;
  setsContra?: number;
  puntosObtenidos: number;
  parejaCon?: string;
  force?: boolean;
}): Promise<void> {
  const metadata = params.partidosDetalle?.length
    ? enrichMetadataWithPartidosDetalle(params.metadata, params.partidosDetalle)
    : params.metadata;

  await upsertParticipacionRanking({
    jugadorId: params.jugadorId,
    tipoEvento: params.tipoEvento,
    eventoId: params.eventoId,
    eventoNombre: params.eventoNombre,
    resultado: params.resultado,
    subtipo: params.subtipo,
    setsFavor: params.setsFavor,
    setsContra: params.setsContra,
    puntosObtenidos: params.puntosObtenidos,
    parejaCon: params.parejaCon,
    metadata,
    force: params.force,
  });
}

/** @deprecated Usar pipeline canónico finalizeCareerEvent (refresh centralizado). */
async function refreshJugadorStatsBatch(jugadorIds: Iterable<string>): Promise<void> {
  const unique = Array.from(new Set(Array.from(jugadorIds).filter(Boolean)));
  await Promise.allSettled(unique.map((id) => rebuildJugadorStats(id)));
}

function resultadoFromRecord(
  wins: number,
  losses: number,
  draws: number
): JugadorResultado {
  if (wins > losses) return "victoria";
  if (losses > wins) return "derrota";
  if (draws > 0 && wins === losses) return "empate";
  if (wins === losses && wins > 0) return "empate";
  return "participación";
}

async function fetchPairsByIds(pairIds: string[]): Promise<Pair[]> {
  const unique = Array.from(new Set(pairIds.filter(Boolean)));
  if (unique.length === 0) return [];
  const { data, error } = await supabase
    .from("pairs")
    .select(PAIRS_SELECT)
    .in("id", unique);
  if (error) {
    console.error("[riviera-jugadores] fetchPairsByIds:", error);
    return [];
  }
  return (data ?? []) as Pair[];
}

function bumpPairPlayers(
  pair: Pair,
  won: boolean,
  drew: boolean,
  setsFavor: number,
  setsContra: number,
  puntosPartido: number,
  agg: Map<string, PlayerAgg>
) {
  const players: Array<{
    id: string;
    name: string;
    legacyPlayerId: string;
  }> = [];
  if (pair.player1_id) {
    players.push({
      id: pair.player1_id,
      name: pair.player1_name || "Jugador",
      legacyPlayerId: pair.player1_id,
    });
  }
  if (pair.player2_id) {
    players.push({
      id: pair.player2_id,
      name: pair.player2_name || "Jugador",
      legacyPlayerId: pair.player2_id,
    });
  }

  for (const pl of players) {
    if (!agg.has(pl.id)) {
      agg.set(pl.id, {
        wins: 0,
        losses: 0,
        draws: 0,
        setsFavor: 0,
        setsContra: 0,
        puntosObtenidos: 0,
        nombre: pl.name,
        legacyPlayerId: pl.legacyPlayerId,
      });
    }
    const st = agg.get(pl.id)!;
    if (drew) st.draws += 1;
    else if (won) st.wins += 1;
    else st.losses += 1;
    st.setsFavor += setsFavor;
    st.setsContra += setsContra;
    st.puntosObtenidos += puntosPartido;
  }
}

function resolveExpressPartidoOutcome(
  localId: string,
  visitId: string,
  puntosLocal: number | null,
  puntosVisitante: number | null,
  ganadorId: string | null
): "local" | "visitante" | "empate" | null {
  if (ganadorId === localId) return "local";
  if (ganadorId === visitId) return "visitante";
  const pl = puntosLocal ?? 0;
  const pv = puntosVisitante ?? 0;
  if (pl > pv) return "local";
  if (pv > pl) return "visitante";
  if (pl === pv && pl > 0) return "empate";
  return null;
}

function processExpressPartido(
  localId: string,
  visitId: string,
  puntosLocal: number | null,
  puntosVisitante: number | null,
  ganadorId: string | null,
  pairMap: Map<string, Pair>,
  agg: Map<string, PlayerAgg>
) {
  const local = pairMap.get(localId);
  const visit = pairMap.get(visitId);
  if (!local || !visit) return;

  const outcome = resolveExpressPartidoOutcome(
    localId,
    visitId,
    puntosLocal,
    puntosVisitante,
    ganadorId
  );
  if (!outcome) return;

  const pl = puntosLocal ?? 0;
  const pv = puntosVisitante ?? 0;

  if (outcome === "empate") {
    bumpPairPlayers(local, false, true, pl, pv, pl, agg);
    bumpPairPlayers(visit, false, true, pv, pl, pv, agg);
    return;
  }
  if (outcome === "local") {
    bumpPairPlayers(local, true, false, pl, pv, pl, agg);
    bumpPairPlayers(visit, false, false, pv, pl, pv, agg);
    return;
  }
  bumpPairPlayers(local, false, false, pl, pv, pl, agg);
  bumpPairPlayers(visit, true, false, pv, pl, pv, agg);
}

// ---------------------------------------------------------------------------
// Reta
// ---------------------------------------------------------------------------

async function syncRetaParticipacionesInner(params: {
  organizadorId: string;
  tournament: Tournament;
  pairs: Pair[];
  matches: Match[];
  excludeJugadorIds?: string[];
}): Promise<CareerEventSyncOutcome> {
  const { organizadorId, tournament, pairs, matches } = params;
  const excluded = toExcludedJugadorIdSet(params.excludeJugadorIds);
  const syncFailures: CareerEventAssertionFailure[] = [];

  try {
    await prepareParticipacionIdentityForOrganizer(organizadorId);
    const { syncLegacyPlayersFromRivieraRegistry } = await import(
      "./playerPoolSync"
    );
    await syncLegacyPlayersFromRivieraRegistry(organizadorId, { force: true });
  } catch (e) {
    console.warn("[riviera-jugadores] syncReta legacy pool:", e);
  }
  const pairById = new Map(pairs.map((p) => [p.id, p]));
  const agg = new Map<string, PlayerAgg>();

  const ensureAggFromPair = (
    playerId: string,
    name: string,
    email?: string | null
  ) => {
    if (!playerId || agg.has(playerId)) return;
    agg.set(playerId, {
      wins: 0,
      losses: 0,
      draws: 0,
      setsFavor: 0,
      setsContra: 0,
      puntosObtenidos: 0,
      nombre: name || "Jugador",
      legacyPlayerId: playerId,
      email: email ?? undefined,
    });
  };

  for (const pair of pairs) {
    ensureAggFromPair(
      pair.player1_id,
      pair.player1_name,
      pair.player1?.email
    );
    ensureAggFromPair(
      pair.player2_id,
      pair.player2_name,
      pair.player2?.email
    );
  }

  const finishedMatches = matches.filter((m) => m.status === "finished");
  const { gamesByMatchId, allGames } = await loadGamesByMatchId(
    finishedMatches,
    getGames
  );

  for (const match of finishedMatches) {
    const pair1 = pairById.get(match.pair1_id);
    const pair2 = pairById.get(match.pair2_id);
    if (!pair1 || !pair2) continue;

    const games = gamesByMatchId.get(match.id) ?? [];
    const { score1, score2 } = getMatchScoresForStandings(match, games);
    if (score1 === 0 && score2 === 0) continue;

    processExpressPartido(
      match.pair1_id,
      match.pair2_id,
      score1,
      score2,
      score1 > score2
        ? match.pair1_id
        : score2 > score1
          ? match.pair2_id
          : null,
      pairById,
      agg
    );
  }

  const sortedPairs = sortPairsForStandings(
    computePairsWithStats(pairs, matches, allGames),
    matches,
    allGames
  );
  const pairRank = new Map(
    sortedPairs.map((p, i) => [
      p.id,
      { pos: i + 1, total: sortedPairs.length },
    ])
  );

  const champCfg = loadChampionshipConfig(tournament.id);
  const standingsMatches = matchesForStandingsTable(
    matches,
    tournament.id,
    champCfg
  );
  const sortedRegular = sortPairsForStandings(
    computePairsWithStats(pairs, standingsMatches, allGames),
    standingsMatches,
    allGames
  );
  const regularPairRank = new Map(
    sortedRegular.map((p, i) => [
      p.id,
      { pos: i + 1, total: sortedRegular.length },
    ])
  );

  const podioPosByPairId = new Map<string, number>();
  let regularRoundsMax: number | undefined;
  if (champCfg?.championshipEnabled) {
    const { regular } = partitionMatches(matches, tournament.id, champCfg);
    regularRoundsMax = resolveRegularRoundsMax(regular, champCfg);
    const podium = await resolveChampionshipPodium(
      pairs,
      matches,
      champCfg,
      allGames
    );
    if (podium?.first) podioPosByPairId.set(podium.first.id, 1);
    if (podium?.second) podioPosByPairId.set(podium.second.id, 2);
    if (podium?.third) podioPosByPairId.set(podium.third.id, 3);
  }

  const partidosDetalleByPlayer = buildPartidosDetalleByLegacyPlayerId(
    pairs,
    matches,
    gamesByMatchId,
    regularRoundsMax
  );

  const esEquipos = tournament.format === "teams";
  const modalidad = esEquipos ? "reta_equipos" : "round_robin";
  const modalidadLabel = esEquipos ? "Reta por equipos" : "Reta";

  let winningTeamIndex: number | null = null;
  const teamPosByIndex = new Map<number, number>();
  const teamConfig = esEquipos ? getTeamConfigFromStorage(tournament.id) : null;
  if (esEquipos && teamConfig) {
    const teamRows = computeTeamStandings(sortedPairs, teamConfig);
    winningTeamIndex = teamRows?.[0]?.teamIndex ?? null;
    teamRows?.forEach((row, i) => {
      teamPosByIndex.set(row.teamIndex, i + 1);
    });
  }

  const formatoRanking: RivieraRankingFormato = esEquipos
    ? "reta_equipos"
    : "reta";

  const touchedJugadorIds = new Set<string>();

  for (const st of Array.from(agg.values())) {
    await runPlayerParticipacionSync(
      syncFailures,
      { nombre: st.nombre, legacyPlayerId: st.legacyPlayerId },
      async () => {
        const { jugadorId, failure } = await resolveJugadorForEventSync(
          {
            nombre: st.nombre,
            organizadorId,
            legacyPlayerId: st.legacyPlayerId,
            email: st.email,
            tipoEvento: "reta",
            eventoId: tournament.id,
          },
          excluded
        );
        if (failure) {
          syncFailures.push(failure);
          return;
        }
        if (!jugadorId) {
          console.warn("[riviera-jugadores] syncReta sin jugador resuelto:", {
            retaId: tournament.id,
            retaNombre: tournament.name,
            nombre: st.nombre,
            legacyPlayerId: st.legacyPlayerId,
          });
          return;
        }
        touchedJugadorIds.add(jugadorId);

        const pair = pairs.find(
          (p) =>
            p.player1_id === st.legacyPlayerId || p.player2_id === st.legacyPlayerId
        );

        if (st.legacyPlayerId) {
          await repairRetaPairLegacyPlayerIds(
            tournament.id,
            st.legacyPlayerId,
            jugadorId
          );
        }

        const { data: jugadorRiviera } = await supabase
          .from("riviera_jugadores")
          .select("legacy_player_id, nombre")
          .eq("id", jugadorId)
          .maybeSingle();

        const canonicalLegacyPlayerId =
          jugadorRiviera?.legacy_player_id?.trim() || st.legacyPlayerId || null;
        const pairSlot =
          pair && st.legacyPlayerId
            ? pair.player1_id === st.legacyPlayerId
              ? 1
              : pair.player2_id === st.legacyPlayerId
                ? 2
                : null
            : null;

        const pairStats = pair
          ? sortedPairs.find((p) => p.id === pair.id)
          : undefined;
        const rankRegular = pair ? regularPairRank.get(pair.id) : undefined;
        const rank = pair ? pairRank.get(pair.id) : undefined;
        const posicionFinal =
          pair && podioPosByPairId.has(pair.id)
            ? podioPosByPairId.get(pair.id)!
            : rankRegular?.pos ?? rank?.pos;
        const totalParticipantes =
          rankRegular?.total ?? rank?.total ?? sortedPairs.length;

        const partidosDetalle =
          partidosDetalleByPlayer.get(st.legacyPlayerId ?? "") ?? [];
        const detSummary = summarizePartidosDetalle(partidosDetalle);

        const partidosGanados =
          detSummary.jugados > 0 ? detSummary.ganados : (pairStats?.pg ?? st.wins);
        const partidosPerdidos =
          detSummary.jugados > 0 ? detSummary.perdidos : (pairStats?.pp ?? st.losses);
        const partidosEmpatados =
          detSummary.jugados > 0 ? detSummary.empatados : st.draws;
        const partidosJugados =
          detSummary.jugados > 0
            ? detSummary.jugados
            : (pairStats?.matchesPlayed ??
              partidosGanados + partidosPerdidos + partidosEmpatados);

        const setsFavorReta =
          detSummary.jugados > 0
            ? detSummary.setsFavor
            : (pairStats?.points ?? st.setsFavor);
        const setsContraReta =
          detSummary.jugados > 0
            ? detSummary.setsContra
            : (pairStats?.pointsReceived ?? st.setsContra);

        let equipoGanador = false;
        let posicionEquipo: number | null = null;
        if (esEquipos && pair && teamConfig) {
          const teamIdx = teamConfig.pairToTeam[pair.id];
          if (teamIdx != null) {
            posicionEquipo = teamPosByIndex.get(teamIdx) ?? null;
            equipoGanador =
              winningTeamIndex != null && teamIdx === winningTeamIndex;
          }
        }

        const { data: perfilRiviera } = await supabase
          .from("riviera_jugadores")
          .select("categoria")
          .eq("id", jugadorId)
          .maybeSingle();

        let resultadoReta = resultadoFromRecord(
          partidosGanados,
          partidosPerdidos,
          partidosEmpatados
        );
        if (!esEquipos && posicionFinal === 1) {
          resultadoReta = "victoria";
        } else if (esEquipos && equipoGanador) {
          resultadoReta = "victoria";
        }

        const metadata = enrichMetadataWithPartidosDetalle(
          {
            subtipo: "reta_cierre",
            ...hostClubMetadata(organizadorId),
            ...(partidosDetalle.length === 0
              ? {
                  partidos_ganados: partidosGanados,
                  partidos_perdidos: partidosPerdidos,
                  partidos_jugados: partidosJugados,
                  partidos_empatados: partidosEmpatados,
                }
              : {}),
            ...(champCfg?.championshipEnabled && regularRoundsMax != null
              ? {
                  remontada_activa: true,
                  regular_rondas_max: regularRoundsMax,
                }
              : {}),
            ...(rankRegular?.pos != null ? { posicion_rr: rankRegular.pos } : {}),
            formato: tournament.format ?? "round_robin",
            modalidad,
            modalidad_label: modalidadLabel,
            reta_id: tournament.id,
            reta_nombre: tournament.name,
            ...(pair?.id ? { pair_id: pair.id } : {}),
            ...(pairSlot != null ? { pair_slot: pairSlot } : {}),
            ...(canonicalLegacyPlayerId
              ? { canonical_legacy_player_id: canonicalLegacyPlayerId }
              : {}),
            ...(tournament.description?.trim()
              ? { evento_descripcion: tournament.description.trim() }
              : {}),
            ...(perfilRiviera?.categoria
              ? { jugador_categoria: perfilRiviera.categoria }
              : {}),
            posicion: posicionFinal,
            total_participantes: totalParticipantes,
            lugar: posicionFinal
              ? formatLugarOrdinal(posicionFinal, totalParticipantes)
              : "Participación",
            equipo_ganador: esEquipos ? equipoGanador : undefined,
          },
          partidosDetalle
        );

        await registrarPuntosRanking({
          jugadorId,
          tipoEvento: "reta",
          eventoId: tournament.id,
          eventoNombre: tournament.name,
          resultado: resultadoReta,
          formato: formatoRanking,
          calcParams: esEquipos
            ? {
                posicion_final: posicionEquipo,
                equipo_ganador: equipoGanador,
              }
            : { posicion_final: posicionFinal ?? null },
          setsFavor: setsFavorReta,
          setsContra: setsContraReta,
          metadata,
        });
      }
    );
  }

  try {
    const ratingApplied = await aplicarRatingRetaFinishedMatches({
      organizadorId,
      pairs,
      matches,
      gamesByMatchId,
      descripcion: tournament.name?.trim()
        ? `Reta: ${tournament.name.trim()}`
        : "Reta Round Robin",
    });
    if (ratingApplied > 0) {
      console.info(`[rating] reta ${tournament.id}: ${ratingApplied} partido(s)`);
    }
  } catch (e) {
    console.warn("[rating] sync reta:", e);
  }

  return {
    touchedJugadorIds: Array.from(touchedJugadorIds),
    participacionEventoId: tournament.id,
    syncFailures: syncFailures.length > 0 ? syncFailures : undefined,
  };
}

/** Una participación por jugador al cerrar la reta. */
export async function syncRetaParticipaciones(params: {
  organizadorId: string;
  tournament: Tournament;
  pairs: Pair[];
  matches: Match[];
  excludeJugadorIds?: string[];
}): Promise<CareerEventSyncOutcome> {
  try {
    return await syncRetaParticipacionesInner(params);
  } catch (e) {
    console.error("[riviera-jugadores] syncRetaParticipaciones:", e);
    return {
      touchedJugadorIds: [],
      syncFailures: [
        {
          code: "sync_failed",
          message: e instanceof Error ? e.message : String(e),
        },
      ],
    };
  }
}

// ---------------------------------------------------------------------------
// Torneo Express
// ---------------------------------------------------------------------------

function torneoExpressCerrado(bundle: TorneoExpressBundle): boolean {
  const t = bundle.torneo;
  return t.estado === "finalizado" || t.fase_torneo === "cerrado";
}

function resolveFinalEliminatoriaMatch(
  bundle: TorneoExpressBundle
): TorneoExpressEliminatoriaPartido | null {
  const { torneo, eliminatoriaPartidos } = bundle;
  if (!torneo.fase_eliminacion || eliminatoriaPartidos.length === 0) {
    return null;
  }

  const total = totalRondasEliminatoria(
    torneo.fase_eliminacion,
    eliminatoriaBracketSize(torneo.fase_eliminacion, torneo.bracket_slots)
  );
  const finales = partidosDeRonda(eliminatoriaPartidos, total).filter(
    (p) => !p.es_bye && p.estado === "jugado"
  );
  return finales[finales.length - 1] ?? finales[0] ?? null;
}

function resolveGanadorParejaIdFromPartido(
  partido: TorneoExpressEliminatoriaPartido
): string | null {
  if (partido.ganador_id) return partido.ganador_id;

  const pl = partido.puntos_local ?? 0;
  const pv = partido.puntos_visitante ?? 0;
  if (pl > pv && partido.pareja_local_id) return partido.pareja_local_id;
  if (pv > pl && partido.pareja_visitante_id) {
    return partido.pareja_visitante_id;
  }
  return null;
}

/** Campeón = pareja ganadora de la final de eliminatoria. */
function resolveCampeonParejaId(bundle: TorneoExpressBundle): string | null {
  const finalMatch = resolveFinalEliminatoriaMatch(bundle);
  if (!finalMatch) return null;
  return resolveGanadorParejaIdFromPartido(finalMatch);
}

/** Subcampeón = pareja perdedora de la final (100 / 50 / 0). */
function resolveSubcampeonParejaId(
  bundle: TorneoExpressBundle,
  campeonParejaId: string
): string | null {
  const finalMatch = resolveFinalEliminatoriaMatch(bundle);
  if (!finalMatch) return null;

  const local = finalMatch.pareja_local_id;
  const visit = finalMatch.pareja_visitante_id;
  if (!local || !visit) return null;

  if (campeonParejaId === local) return visit;
  if (campeonParejaId === visit) return local;
  return null;
}

function legacyPlayerIdsFromPair(pair: Pair | undefined): Set<string> {
  const ids = new Set<string>();
  if (!pair) return ids;
  if (pair.player1_id) ids.add(pair.player1_id);
  if (pair.player2_id) ids.add(pair.player2_id);
  return ids;
}

function clasificadosPlayerIdsFromBundle(
  bundle: TorneoExpressBundle,
  pairMap: Map<string, Pair>
): Set<string> {
  const playerIds = new Set<string>();
  clasificadosPairIdsFromBundle(bundle).forEach((parejaId) => {
    legacyPlayerIdsFromPair(pairMap.get(parejaId)).forEach((pl) => {
      playerIds.add(pl);
    });
  });
  return playerIds;
}

function resolveExpressPlayerPosicion(
  legacyPlayerId: string | undefined,
  ctx: {
    campeonPlayerIds: Set<string>;
    subcampeonPlayerIds: Set<string>;
    tercerPlayerIds: Set<string>;
    cuartoPlayerIds: Set<string>;
    semiPlayerIds: Set<string>;
  }
): { posicion_final: number | null } {
  if (!legacyPlayerId) return { posicion_final: null };
  if (ctx.campeonPlayerIds.has(legacyPlayerId)) {
    return { posicion_final: 1 };
  }
  if (ctx.subcampeonPlayerIds.has(legacyPlayerId)) {
    return { posicion_final: 2 };
  }
  if (ctx.tercerPlayerIds.has(legacyPlayerId)) {
    return { posicion_final: 3 };
  }
  if (ctx.cuartoPlayerIds.has(legacyPlayerId)) {
    return { posicion_final: 4 };
  }
  return { posicion_final: null };
}

function buildExpressPlacementContext(
  bundle: TorneoExpressBundle,
  campeonParejaId: string | null,
  subcampeonParejaId: string | null,
  pairMap: Map<string, Pair>
): {
  campeonPlayerIds: Set<string>;
  subcampeonPlayerIds: Set<string>;
  tercerPlayerIds: Set<string>;
  cuartoPlayerIds: Set<string>;
  semiPlayerIds: Set<string>;
  finalPlayerIds: Set<string>;
} {
  const campeonPlayerIds = campeonParejaId
    ? legacyPlayerIdsFromPair(pairMap.get(campeonParejaId))
    : new Set<string>();
  const subcampeonPlayerIds = subcampeonParejaId
    ? legacyPlayerIdsFromPair(pairMap.get(subcampeonParejaId))
    : new Set<string>();

  const tercerPlayerIds = new Set<string>();
  const cuartoPlayerIds = new Set<string>();
  const semiPlayerIds = new Set<string>();
  const finalPlayerIds = new Set<string>([
    ...Array.from(campeonPlayerIds),
    ...Array.from(subcampeonPlayerIds),
  ]);

  const torneo = bundle.torneo;
  if (!torneo.fase_eliminacion || bundle.eliminatoriaPartidos.length === 0) {
    return {
      campeonPlayerIds,
      subcampeonPlayerIds,
      tercerPlayerIds,
      cuartoPlayerIds,
      semiPlayerIds,
      finalPlayerIds,
    };
  }

  const bracketSize = eliminatoriaBracketSize(
    torneo.fase_eliminacion,
    torneo.bracket_slots
  );
  const total = totalRondasEliminatoria(torneo.fase_eliminacion, bracketSize);
  const semiRonda = total >= 2 ? total - 1 : null;

  const tercerMatch = bundle.eliminatoriaPartidos.find(
    (p) => isRondaTercerLugar(p.ronda) && p.estado === "jugado" && !p.es_bye
  );

  if (tercerMatch?.ganador_id) {
    const tercerParejaId = tercerMatch.ganador_id;
    const local = tercerMatch.pareja_local_id;
    const visit = tercerMatch.pareja_visitante_id;
    const cuartoParejaId =
      local && visit
        ? tercerParejaId === local
          ? visit
          : local
        : null;

    Array.from(legacyPlayerIdsFromPair(pairMap.get(tercerParejaId))).forEach(
      (id) => tercerPlayerIds.add(id)
    );
    if (cuartoParejaId) {
      Array.from(legacyPlayerIdsFromPair(pairMap.get(cuartoParejaId))).forEach(
        (id) => cuartoPlayerIds.add(id)
      );
    }
  } else if (semiRonda != null) {
    const semiMatches = partidosDeRonda(
      bundle.eliminatoriaPartidos,
      semiRonda
    ).filter((p) => p.estado === "jugado" && !p.es_bye);

    const semiLoserParejaIds: string[] = [];
    for (const m of semiMatches) {
      if (m.pareja_local_id) {
        Array.from(legacyPlayerIdsFromPair(pairMap.get(m.pareja_local_id))).forEach(
          (id) => semiPlayerIds.add(id)
        );
      }
      if (m.pareja_visitante_id) {
        Array.from(
          legacyPlayerIdsFromPair(pairMap.get(m.pareja_visitante_id))
        ).forEach((id) => semiPlayerIds.add(id));
      }
      const winner = resolveGanadorParejaIdFromPartido(m);
      const local = m.pareja_local_id;
      const visit = m.pareja_visitante_id;
      if (!winner || !local || !visit) continue;
      const loser = winner === local ? visit : local;
      if (loser !== campeonParejaId && loser !== subcampeonParejaId) {
        semiLoserParejaIds.push(loser);
      }
    }

    if (semiLoserParejaIds[0]) {
      Array.from(
        legacyPlayerIdsFromPair(pairMap.get(semiLoserParejaIds[0]))
      ).forEach((id) => tercerPlayerIds.add(id));
    }
    if (semiLoserParejaIds[1]) {
      Array.from(
        legacyPlayerIdsFromPair(pairMap.get(semiLoserParejaIds[1]))
      ).forEach((id) => cuartoPlayerIds.add(id));
    }
  }

  const finalMatches = partidosDeRonda(bundle.eliminatoriaPartidos, total).filter(
    (p) => p.estado === "jugado" && !p.es_bye
  );
  finalMatches.forEach((m) => {
    if (m.pareja_local_id) {
      legacyPlayerIdsFromPair(pairMap.get(m.pareja_local_id)).forEach((id) =>
        finalPlayerIds.add(id)
      );
    }
    if (m.pareja_visitante_id) {
      legacyPlayerIdsFromPair(pairMap.get(m.pareja_visitante_id)).forEach((id) =>
        finalPlayerIds.add(id)
      );
    }
  });

  return {
    campeonPlayerIds,
    subcampeonPlayerIds,
    tercerPlayerIds,
    cuartoPlayerIds,
    semiPlayerIds,
    finalPlayerIds,
  };
}

async function flushTorneoExpressPlayerAgg(
  agg: Map<string, PlayerAgg>,
  organizadorId: string,
  torneoId: string,
  eventoNombre: string,
  campeonParejaId: string | null,
  subcampeonParejaId: string | null,
  pairMap: Map<string, Pair>,
  placementCtx: ReturnType<typeof buildExpressPlacementContext>,
  clasificadosPlayerIds: Set<string>,
  excludeJugadorIds?: string[]
): Promise<CareerEventSyncOutcome> {
  const excluded = toExcludedJugadorIdSet(excludeJugadorIds);
  const syncFailures: CareerEventAssertionFailure[] = [];
  const touchedJugadorIds: string[] = [];
  for (const st of Array.from(agg.values())) {
    await runPlayerParticipacionSync(
      syncFailures,
      { nombre: st.nombre, legacyPlayerId: st.legacyPlayerId },
      async () => {
        const { jugadorId, failure } = await resolveJugadorForEventSync(
          {
            nombre: st.nombre,
            organizadorId,
            legacyPlayerId: st.legacyPlayerId,
            legacyLigaJugadorId: st.legacyLigaJugadorId,
            email: st.email,
            tipoEvento: "torneo_express",
            eventoId: torneoId,
          },
          excluded
        );
        if (failure) {
          syncFailures.push(failure);
          return;
        }
        if (!jugadorId) return;
        touchedJugadorIds.push(jugadorId);

        const { posicion_final } = resolveExpressPlayerPosicion(
          st.legacyPlayerId,
          placementCtx
        );
        const paso_fase_grupos = st.legacyPlayerId
          ? clasificadosPlayerIds.has(st.legacyPlayerId)
          : false;
        const paso_semifinal = st.legacyPlayerId
          ? placementCtx.semiPlayerIds.has(st.legacyPlayerId)
          : false;
        const llego_final = st.legacyPlayerId
          ? placementCtx.finalPlayerIds.has(st.legacyPlayerId)
          : false;

        let resultado = resultadoFromRecord(st.wins, st.losses, st.draws);
        if (posicion_final === 1) resultado = "victoria";
        else if (posicion_final === 2) resultado = "derrota";

        await registrarPuntosRanking({
          jugadorId,
          tipoEvento: "torneo_express",
          eventoId: torneoId,
          eventoNombre,
          resultado,
          formato: "express",
          calcParams: {
            posicion_final,
            paso_fase_grupos,
            paso_semifinal,
            llego_final,
          },
          setsFavor: st.setsFavor,
          setsContra: st.setsContra,
          metadata: {
            subtipo: "express_cierre",
            ...hostClubMetadata(organizadorId),
            partidos_ganados: st.wins,
            partidos_perdidos: st.losses,
            partidos_empatados: st.draws,
            puntos_juego_acumulados: st.puntosObtenidos,
            posicion_final,
            paso_fase_grupos,
            paso_semifinal,
            llego_final,
            lugar:
              posicion_final != null
                ? formatLugarOrdinal(posicion_final)
                : llego_final
                  ? "Final"
                  : paso_semifinal
                    ? "Semifinal"
                    : paso_fase_grupos
                      ? "Eliminatoria"
                      : "Participación",
            modalidad: "torneo_express",
            modalidad_label: "Torneo Express",
            campeon_torneo: posicion_final === 1,
            subcampeon_torneo: posicion_final === 2,
            pareja_campeon_id: campeonParejaId,
            pareja_subcampeon_id: subcampeonParejaId,
            torneo_express_id: torneoId,
          },
        });
      }
    );
  }
  return {
    touchedJugadorIds,
    syncFailures: syncFailures.length > 0 ? syncFailures : undefined,
  };
}

export async function syncTorneoExpressParticipaciones(
  torneoId: string,
  userId: string,
  options?: CareerEventSyncOptions
): Promise<CareerEventSyncOutcome> {
  try {
    const bundle = await fetchTorneoExpressBundle(torneoId);
    if (!bundle) {
      console.error(
        "[riviera-jugadores] syncTorneoExpressParticipaciones: torneo no encontrado"
      );
      return { touchedJugadorIds: [] };
    }

    if (!torneoExpressCerrado(bundle)) {
      console.warn(
        "[riviera-jugadores] syncTorneoExpressParticipaciones: torneo aún no cerrado",
        torneoId
      );
      return { touchedJugadorIds: [] };
    }

    const campeonParejaId = resolveCampeonParejaId(bundle);
    const subcampeonParejaId = campeonParejaId
      ? resolveSubcampeonParejaId(bundle, campeonParejaId)
      : null;

    if (!campeonParejaId) {
      console.warn(
        "[riviera-jugadores] syncTorneoExpressParticipaciones: sin final; solo puntos de participación",
        torneoId
      );
    }

    const partidoParejaIds: string[] = [];
    if (campeonParejaId) partidoParejaIds.push(campeonParejaId);
    if (subcampeonParejaId) partidoParejaIds.push(subcampeonParejaId);
    for (const list of Object.values(bundle.parejasPorGrupo)) {
      for (const gp of list) {
        if (gp.pareja_id) partidoParejaIds.push(gp.pareja_id);
      }
    }
    for (const list of Object.values(bundle.partidosPorGrupo)) {
      for (const p of list) {
        if (p.estado === "jugado") {
          partidoParejaIds.push(p.pareja_local_id, p.pareja_visitante_id);
        }
      }
    }
    for (const p of bundle.eliminatoriaPartidos) {
      if (p.estado === "jugado" && !p.es_bye) {
        if (p.pareja_local_id) partidoParejaIds.push(p.pareja_local_id);
        if (p.pareja_visitante_id) partidoParejaIds.push(p.pareja_visitante_id);
      }
    }

    const pairs = await fetchPairsByIds(partidoParejaIds);
    const pairMap = new Map(pairs.map((p) => [p.id, p]));
    const agg = new Map<string, PlayerAgg>();

    for (const list of Object.values(bundle.partidosPorGrupo)) {
      for (const p of list) {
        if (p.estado !== "jugado") continue;
        processExpressPartido(
          p.pareja_local_id,
          p.pareja_visitante_id,
          p.puntos_local,
          p.puntos_visitante,
          p.ganador_id,
          pairMap,
          agg
        );
      }
    }

    for (const p of bundle.eliminatoriaPartidos) {
      if (p.estado !== "jugado" || p.es_bye) continue;
      if (!p.pareja_local_id || !p.pareja_visitante_id) continue;
      processExpressPartido(
        p.pareja_local_id,
        p.pareja_visitante_id,
        p.puntos_local,
        p.puntos_visitante,
        p.ganador_id,
        pairMap,
        agg
      );
    }

    for (const pair of pairs) {
      for (const pl of [pair.player1_id, pair.player2_id]) {
        if (!pl) continue;
        if (!agg.has(pl)) {
          agg.set(pl, {
            wins: 0,
            losses: 0,
            draws: 0,
            setsFavor: 0,
            setsContra: 0,
            puntosObtenidos: 0,
            nombre:
              pl === pair.player1_id
                ? pair.player1_name || "Jugador"
                : pair.player2_name || "Jugador",
            legacyPlayerId: pl,
          });
        }
      }
    }

    const placementCtx = buildExpressPlacementContext(
      bundle,
      campeonParejaId,
      subcampeonParejaId,
      pairMap
    );
    const clasificadosPlayerIds = clasificadosPlayerIdsFromBundle(bundle, pairMap);

    const expressOutcome = await flushTorneoExpressPlayerAgg(
      agg,
      userId,
      torneoId,
      bundle.torneo.nombre,
      campeonParejaId,
      subcampeonParejaId,
      pairMap,
      placementCtx,
      clasificadosPlayerIds,
      options?.excludeJugadorIds
    );
    return {
      touchedJugadorIds: expressOutcome.touchedJugadorIds,
      participacionEventoId: torneoId,
      syncFailures: expressOutcome.syncFailures,
    };
  } catch (e) {
    console.error("[riviera-jugadores] syncTorneoExpressParticipaciones:", e);
    return { touchedJugadorIds: [] };
  }
}

// ---------------------------------------------------------------------------
// Liga
// ---------------------------------------------------------------------------

export async function syncLigaJornada(
  ligaId: string,
  jornadaNumero: number,
  userId: string,
  options?: CareerEventSyncOptions
): Promise<CareerEventSyncOutcome> {
  try {
    const detalle = await getLigaById(ligaId);
    const jornada = detalle.jornadas.find((j) => j.numero === jornadaNumero);
    if (!jornada) {
      console.error(
        "[riviera-jugadores] syncLigaJornada: jornada no encontrada",
        jornadaNumero
      );
      return { touchedJugadorIds: [] };
    }

    const parejas = jornada.parejas ?? [];
    const partidos = (jornada.partidos ?? []).filter(
      (p) => p.estado === "completed"
    );
    const parejaMap = new Map(parejas.map((p) => [p.id, p]));
    const agg = new Map<string, PlayerAgg>();

    const bumpLigaPlayer = (
      jugadorId: string,
      nombre: string,
      won: boolean,
      drew: boolean,
      sf: number,
      sc: number,
      pts: number,
      parejaCon?: string
    ) => {
      if (!agg.has(jugadorId)) {
        agg.set(jugadorId, {
          wins: 0,
          losses: 0,
          draws: 0,
          setsFavor: 0,
          setsContra: 0,
          puntosObtenidos: 0,
          nombre,
          legacyLigaJugadorId: jugadorId,
        });
      }
      const st = agg.get(jugadorId)!;
      if (drew) st.draws += 1;
      else if (won) st.wins += 1;
      else st.losses += 1;
      st.setsFavor += sf;
      st.setsContra += sc;
      st.puntosObtenidos += pts;
      if (parejaCon) {
        (st as PlayerAgg & { lastPareja?: string }).lastPareja = parejaCon;
      }
    };

    for (const m of partidos) {
      const s1 = Number(m.score_pareja1 ?? 0);
      const s2 = Number(m.score_pareja2 ?? 0);
      const par1 = parejaMap.get(m.pareja1_id);
      const par2 = parejaMap.get(m.pareja2_id);
      if (!par1 || !par2) continue;

      const j1 = par1.jugador1;
      const j2 = par1.jugador2;
      const j3 = par2.jugador1;
      const j4 = par2.jugador2;
      if (!j1 || !j2 || !j3 || !j4) continue;

      const localWins = s1 > s2;
      const visitWins = s2 > s1;
      const draw = s1 === s2;

      const pareja2Label = `${j3.nombre} / ${j4.nombre}`;
      const pareja1Label = `${j1.nombre} / ${j2.nombre}`;

      if (draw) {
        for (const j of [j1, j2]) {
          bumpLigaPlayer(j.id, j.nombre, false, true, s1, s2, s1, pareja2Label);
        }
        for (const j of [j3, j4]) {
          bumpLigaPlayer(j.id, j.nombre, false, true, s2, s1, s2, pareja1Label);
        }
      } else if (localWins) {
        for (const j of [j1, j2]) {
          bumpLigaPlayer(j.id, j.nombre, true, false, s1, s2, s1, pareja2Label);
        }
        for (const j of [j3, j4]) {
          bumpLigaPlayer(j.id, j.nombre, false, false, s2, s1, s2, pareja1Label);
        }
      } else if (visitWins) {
        for (const j of [j1, j2]) {
          bumpLigaPlayer(j.id, j.nombre, false, false, s1, s2, s1, pareja2Label);
        }
        for (const j of [j3, j4]) {
          bumpLigaPlayer(j.id, j.nombre, true, false, s2, s1, s2, pareja1Label);
        }
      }
    }

    const eventoNombre = `Liga ${detalle.nombre} - Jornada ${jornada.numero}`;
    const jornadaStats = computeJornadaPublicStats(jornada, {
      parejasFijas: detalle.modalidad === "parejas_fijas",
    });
    const partidosDetalleByJugador =
      buildLigaJornadaPartidosDetalleByJugadorId(jornada);
    const posByJugador = new Map(
      jornadaStats.rankingJugadores.map((j) => [j.jugadorId, j.posicion])
    );
    const totalJugadores = jornadaStats.rankingJugadores.length;

    const ganadorPareja = jornadaStats.ganadorPareja;
    const jornadaWinnerIds = new Set<string>();
    if (ganadorPareja) {
      const gp = parejaMap.get(ganadorPareja.parejaId);
      if (gp?.jugador1_id) jornadaWinnerIds.add(gp.jugador1_id);
      if (gp?.jugador2_id) jornadaWinnerIds.add(gp.jugador2_id);
    }

    const touchedJugadorIds = new Set<string>();
    const excluded = toExcludedJugadorIdSet(options?.excludeJugadorIds);
    const syncFailures: CareerEventAssertionFailure[] = [];

    for (const st of Array.from(agg.values())) {
      await runPlayerParticipacionSync(
        syncFailures,
        { nombre: st.nombre, legacyPlayerId: st.legacyLigaJugadorId },
        async () => {
          const { jugadorId, failure } = await resolveJugadorForEventSync(
            {
              nombre: st.nombre,
              organizadorId: userId,
              legacyLigaJugadorId: st.legacyLigaJugadorId,
              tipoEvento: "liga",
              eventoId: jornada.id,
            },
            excluded
          );
          if (failure) {
            syncFailures.push(failure);
            return;
          }
          if (!jugadorId) return;
          touchedJugadorIds.add(jugadorId);

          const posicion = st.legacyLigaJugadorId
            ? posByJugador.get(st.legacyLigaJugadorId)
            : undefined;

          const ganoJornada =
            !!st.legacyLigaJugadorId &&
            jornadaWinnerIds.has(st.legacyLigaJugadorId);

          const partidosDetalle = st.legacyLigaJugadorId
            ? (partidosDetalleByJugador.get(st.legacyLigaJugadorId) ?? [])
            : [];
          const detSummary = summarizePartidosDetalle(partidosDetalle);
          const partidosJugados =
            detSummary.jugados > 0
              ? detSummary.jugados
              : st.wins + st.losses + st.draws;
          const setsFavorLiga =
            detSummary.jugados > 0 ? detSummary.setsFavor : st.setsFavor;
          const setsContraLiga =
            detSummary.jugados > 0 ? detSummary.setsContra : st.setsContra;

          const metadata = enrichMetadataWithPartidosDetalle(
            {
              subtipo: "liga_jornada",
              ...hostClubMetadata(userId),
              liga_id: ligaId,
              liga_nombre: detalle.nombre,
              jornada_numero: jornada.numero,
              jornada_ganada: ganoJornada,
              ...(partidosDetalle.length === 0
                ? {
                    partidos_ganados: st.wins,
                    partidos_perdidos: st.losses,
                    partidos_jugados: partidosJugados,
                    partidos_empatados: st.draws,
                  }
                : {}),
              modalidad: "liga",
              modalidad_label: "Liga",
              posicion_jornada: posicion,
              total_participantes: totalJugadores,
              lugar:
                ganoJornada
                  ? `Ganador jornada ${jornada.numero}`
                  : posicion != null && posicion > 0
                    ? formatLugarOrdinal(posicion, totalJugadores)
                    : "Participación en jornada",
            },
            partidosDetalle
          );

          await registrarPuntosRanking({
            jugadorId,
            tipoEvento: "liga",
            eventoId: jornada.id,
            eventoNombre,
            resultado: "participación",
            formato: "liga",
            calcParams: { jornadas_ganadas: ganoJornada ? 1 : 0 },
            setsFavor: setsFavorLiga,
            setsContra: setsContraLiga,
            parejaCon: (st as PlayerAgg & { lastPareja?: string }).lastPareja,
            upsertSubtipo: "liga_jornada",
            metadata,
          });
        }
      );
    }

    return {
      touchedJugadorIds: Array.from(touchedJugadorIds),
      participacionEventoId: jornada.id,
      syncFailures: syncFailures.length > 0 ? syncFailures : undefined,
    };
  } catch (e) {
    console.error("[riviera-jugadores] syncLigaJornada:", e);
    return { touchedJugadorIds: [] };
  }
}

/** +100 al inscribirse (una vez por temporada de liga). */
export async function syncLigaInscripcionRanking(
  ligaId: string,
  legacyLigaJugadorId: string,
  organizadorId: string,
  options?: CareerEventSyncOptions
): Promise<CareerEventSyncOutcome> {
  const syncFailures: CareerEventAssertionFailure[] = [];
  try {
    const detalle = await getLigaById(ligaId);
    const jugadorLiga = detalle.jugadores.find((j) => j.id === legacyLigaJugadorId);
    const nombre = jugadorLiga?.nombre ?? "Jugador";

    const { jugadorId, failure } = await resolveJugadorForEventSync(
      {
        nombre,
        organizadorId,
        legacyLigaJugadorId,
        tipoEvento: "liga",
        eventoId: ligaId,
      },
      toExcludedJugadorIdSet(options?.excludeJugadorIds)
    );
    if (failure) {
      syncFailures.push(failure);
      return { touchedJugadorIds: [], syncFailures };
    }
    if (!jugadorId) return { touchedJugadorIds: [] };

    await registrarPuntosRanking({
      jugadorId,
      tipoEvento: "liga",
      eventoId: ligaId,
      eventoNombre: `Liga ${detalle.nombre} — Inscripción`,
      resultado: "participación",
      formato: "liga",
      calcParams: { esNuevoEnLiga: true },
      metadata: {
        subtipo: "liga_inscripcion",
        ...hostClubMetadata(organizadorId),
        liga_id: ligaId,
        liga_nombre: detalle.nombre,
        modalidad: "liga",
        modalidad_label: "Liga",
        lugar: "Inscripción a la liga",
      },
      skipIfSubtipoExists: "liga_inscripcion",
    });
    return {
      touchedJugadorIds: [jugadorId],
      participacionEventoId: ligaId,
    };
  } catch (e) {
    console.error("[riviera-jugadores] syncLigaInscripcionRanking:", e);
    return { touchedJugadorIds: [] };
  }
}

/** Podio final al cerrar la liga (+500 / +250 / +100). */
export async function syncLigaFinalPodio(
  ligaId: string,
  organizadorId: string,
  options?: CareerEventSyncOptions
): Promise<CareerEventSyncOutcome> {
  const touchedJugadorIds = new Set<string>();
  const syncFailures: CareerEventAssertionFailure[] = [];
  const excluded = toExcludedJugadorIdSet(options?.excludeJugadorIds);
  try {
    const detalle = await getLigaById(ligaId);
    const ranking = [...detalle.inscripciones].sort(
      (a, b) => b.puntos - a.puntos
    );

    for (let i = 0; i < ranking.length; i += 1) {
      const posicion = i + 1;
      if (posicion > 3) break;

      const ins = ranking[i];
      const nombre = ins.jugador?.nombre ?? "Jugador";
      await runPlayerParticipacionSync(
        syncFailures,
        { nombre, legacyPlayerId: ins.jugador_id },
        async () => {
          const { jugadorId, failure } = await resolveJugadorForEventSync(
            {
              nombre,
              organizadorId,
              legacyLigaJugadorId: ins.jugador_id,
              tipoEvento: "liga",
              eventoId: ligaId,
            },
            excluded
          );
          if (failure) {
            syncFailures.push(failure);
            return;
          }
          if (!jugadorId) return;
          touchedJugadorIds.add(jugadorId);

          const resultado: JugadorResultado =
            posicion === 1 ? "victoria" : posicion === 2 ? "derrota" : "empate";

          await registrarPuntosRanking({
            jugadorId,
            tipoEvento: "liga",
            eventoId: ligaId,
            eventoNombre: `Liga ${detalle.nombre} — Podio final`,
            resultado,
            formato: "liga",
            calcParams: { posicion_final: posicion },
            metadata: {
              subtipo: "liga_podio_final",
              ...hostClubMetadata(organizadorId),
              liga_id: ligaId,
              liga_nombre: detalle.nombre,
              posicion_final: posicion,
              modalidad: "liga",
              modalidad_label: "Liga",
              lugar: formatLugarOrdinal(posicion, ranking.length),
            },
          });
        }
      );
    }
    return {
      touchedJugadorIds: Array.from(touchedJugadorIds),
      participacionEventoId: ligaId,
      syncFailures: syncFailures.length > 0 ? syncFailures : undefined,
    };
  } catch (e) {
    console.error("[riviera-jugadores] syncLigaFinalPodio:", e);
    return { touchedJugadorIds: [] };
  }
}

// ---------------------------------------------------------------------------
// Americano Dinámico
// ---------------------------------------------------------------------------

/** Re-sincroniza jornadas de liga completadas (metadata de partidos W/L + stats). */
export async function backfillLigaJornadaHistorial(
  organizadorId: string
): Promise<number> {
  let count = 0;
  try {
    const { data: ligas, error } = await supabase
      .from("ligas")
      .select("id")
      .eq("organizador_id", organizadorId);

    if (error || !ligas?.length) return 0;

    for (const liga of ligas) {
      const detalle = await getLigaById(String(liga.id));
      for (const jornada of detalle.jornadas) {
        if (jornada.estado !== "completed") continue;
        const outcome = await syncLigaJornada(
          String(liga.id),
          jornada.numero,
          organizadorId
        );
        await refreshJugadorStatsBatch(outcome.touchedJugadorIds);
        count += 1;
      }
    }
  } catch (e) {
    console.error("[riviera-jugadores] backfillLigaJornadaHistorial:", e);
  }
  return count;
}

/**
 * Reconstruye participaciones desde retas ya finalizadas (actualiza lugar y modalidad).
 */
export async function backfillRetasHistorial(organizadorId: string): Promise<number> {
  let count = 0;
  try {
    const tournaments = await getTournaments(organizadorId);
    for (const t of tournaments) {
      if (!t.is_finished) continue;
      const [pairs, matches] = await Promise.all([
        getPairs(t.id),
        getMatches(t.id),
      ]);
      const outcome = await syncRetaParticipaciones({
        organizadorId,
        tournament: t,
        pairs,
        matches,
      });
      await refreshJugadorStatsBatch(outcome.touchedJugadorIds);
      count += 1;
    }
  } catch (e) {
    console.error("[riviera-jugadores] backfillRetasHistorial:", e);
  }
  return count;
}

async function getParticipacionAmericanoCierre(
  jugadorId: string,
  eventoId: string
): Promise<{
  id: string;
  puntos_obtenidos: number | null;
  metadata: Record<string, unknown> | null;
} | null> {
  try {
    const { data, error } = await supabase
      .from("jugador_participaciones")
      .select("id, puntos_obtenidos, metadata")
      .eq("jugador_id", jugadorId)
      .eq("tipo_evento", "americano")
      .eq("evento_id", eventoId)
      .filter("metadata->>subtipo", "eq", "americano_cierre")
      .maybeSingle();
    if (error || !data) return null;
    return data as {
      id: string;
      puntos_obtenidos: number | null;
      metadata: Record<string, unknown> | null;
    };
  } catch {
    return null;
  }
}

export async function syncAmericanoParticipaciones(
  sesionId: string,
  nombre: string,
  jugadores: AmericanoPlayer[],
  rounds: AmericanoRound[],
  userId: string,
  options?: CareerEventSyncOptions
): Promise<CareerEventSyncOutcome> {
  try {
    const statsMap = buildAmericanoPlayerStandingStats(jugadores, rounds);
    const eventoNombre = `Americano Dinámico - ${nombre.trim() || "Sesión"}`;
    const ranked = getAmericanoRanking(jugadores, rounds);
    const fechaFallback = new Date().toISOString();
    const touchedJugadorIds = new Set<string>();
    const syncFailures: CareerEventAssertionFailure[] = [];
    const excluded = toExcludedJugadorIdSet(options?.excludeJugadorIds);

    let posicion = 0;
    for (const jugador of ranked) {
      posicion += 1;
      const currentPosicion = posicion;
      const st = statsMap.get(jugador.id);
      await runPlayerParticipacionSync(
        syncFailures,
        { nombre: jugador.name, legacyPlayerId: jugador.id },
        async () => {
          const { jugadorId, failure } = await resolveJugadorForEventSync(
            {
              nombre: jugador.name,
              organizadorId: userId,
              legacyPlayerId: jugador.id.includes("-") ? jugador.id : undefined,
              tipoEvento: "americano",
              eventoId: sesionId,
            },
            excluded
          );
          if (failure) {
            syncFailures.push(failure);
            return;
          }
          if (!jugadorId) {
            console.warn(
              "[riviera-jugadores] americano sin perfil Riviera:",
              jugador.name
            );
            return;
          }
          touchedJugadorIds.add(jugadorId);

          const partidosDetalle = buildAmericanoPartidosDetalleForPlayer(
            jugador.id,
            rounds,
            fechaFallback
          );
          const detSummary = summarizePartidosDetalle(partidosDetalle);

          const podioPos = currentPosicion <= 3 ? currentPosicion : null;
          const calcParams: Omit<CalcularPuntosEventoParams, "formato"> = {
            victorias_americano: st?.pg ?? 0,
            posicion_final: podioPos,
          };
          const { total, desglose } = calcularPuntosEventoDesglose({
            formato: "americano",
            ...calcParams,
          });
          const metadata = enrichMetadataWithPartidosDetalle(
            rankingMetadata(desglose, {
              subtipo: "americano_cierre",
              ...hostClubMetadata(userId),
              partidos:
                detSummary.jugados > 0
                  ? detSummary.jugados
                  : (st?.pj ?? jugador.stats.gamesPlayed),
              ...(partidosDetalle.length === 0
                ? {
                    partidos_jugados: st?.pj ?? jugador.stats.gamesPlayed,
                    partidos_ganados: st?.pg ?? 0,
                    partidos_perdidos: st?.pp ?? 0,
                    partidos_empatados: st?.pe ?? 0,
                  }
                : {}),
              banquillo: jugador.stats.roundsOnBench,
              victorias_ranking: st?.pg ?? 0,
              posicion_final: currentPosicion,
              posicion: currentPosicion,
              total_participantes: ranked.length,
              lugar: formatLugarOrdinal(currentPosicion, ranked.length),
              modalidad: "americano",
              modalidad_label: "Pádel Americano",
              puntos_a_favor: jugador.stats.pointsFor,
              puntos_en_contra: jugador.stats.pointsAgainst,
            }),
            partidosDetalle
          );
          const resultado: JugadorResultado =
            podioPos === 1
              ? "victoria"
              : podioPos === 2
                ? "derrota"
                : podioPos === 3
                  ? "empate"
                  : "participación";

          const setsFavor =
            detSummary.jugados > 0 ? detSummary.setsFavor : jugador.stats.pointsFor;
          const setsContra =
            detSummary.jugados > 0
              ? detSummary.setsContra
              : jugador.stats.pointsAgainst;

          const existing = await getParticipacionAmericanoCierre(
            jugadorId,
            sesionId
          );
          if (existing) {
            const aplicados = existing.puntos_obtenidos ?? 0;
            const delta = total - aplicados;
            if (delta !== 0) {
              await adjustRankingPuntosManual(
                userId,
                jugadorId,
                delta,
                `Corrección ${eventoNombre}`,
                { bypassPermisoCheck: true }
              );
            }
          }

          await registrarPuntosRanking({
            jugadorId,
            tipoEvento: "americano",
            eventoId: sesionId,
            eventoNombre,
            resultado,
            formato: "americano",
            calcParams,
            setsFavor,
            setsContra,
            metadata: metadata as Record<string, unknown>,
            upsertSubtipo: "americano_cierre",
          });
        }
      );
    }

    return {
      touchedJugadorIds: Array.from(touchedJugadorIds),
      participacionEventoId: sesionId,
      syncFailures: syncFailures.length > 0 ? syncFailures : undefined,
    };
  } catch (e) {
    console.error("[riviera-jugadores] syncAmericanoParticipaciones:", e);
    return { touchedJugadorIds: [] };
  }
}

/** Importa puntos e historial de americanos finalizados (local o público en Supabase). */
export async function backfillAmericanoHistorial(
  organizadorId: string
): Promise<number> {
  let count = 0;
  try {
    const tournaments = await getTournaments(organizadorId);
    for (const t of tournaments) {
      if (!t.is_finished || !isAmericanoTournament(t)) continue;

      let snap = loadAmericanoDinamicoSnapshot(t.id);
      if (!snap || snap.tournamentPhase !== "finished" || !snap.rounds.length) {
        let remote: FetchAmericanoLivePublicResult | null = null;
        try {
          remote = await fetchAmericanoLivePublic(t.id);
        } catch {
          remote = null;
        }
        if (
          remote?.status === "ok" &&
          remote.snapshot.tournamentPhase === "finished" &&
          remote.snapshot.rounds.length > 0
        ) {
          snap = remote.snapshot;
        }
      }

      if (!snap || snap.tournamentPhase !== "finished" || !snap.rounds.length) {
        continue;
      }

      const rebuilt = rebuildAmericanoFromSnapshot(snap);
      if (!rebuilt) continue;

      const outcome = await syncAmericanoParticipaciones(
        t.id,
        t.name,
        rebuilt.players,
        rebuilt.rounds,
        organizadorId
      );
      await refreshJugadorStatsBatch(outcome.touchedJugadorIds);
      count += 1;
    }
  } catch (e) {
    console.error("[riviera-jugadores] backfillAmericanoHistorial:", e);
  }
  return count;
}

// ---------------------------------------------------------------------------
// Duelo 2 vs 2
// ---------------------------------------------------------------------------

export async function syncDuelo2v2Participaciones(params: {
  organizadorId: string;
  duelo: Duelo2v2;
  excludeJugadorIds?: string[];
}): Promise<CareerEventSyncOutcome> {
  const { organizadorId, duelo } = params;
  if (duelo.estado !== "finalizado" || !duelo.ganador) {
    return { touchedJugadorIds: [] };
  }

  const eventoNombre = duelo.nombre.trim() || "Duelo 2 vs 2";
  const fecha =
    duelo.finalizado_at?.slice(0, 10) ??
    duelo.updated_at.slice(0, 10) ??
    new Date().toISOString().slice(0, 10);

  const slots: Array<{
    jugadorId: string | null;
    nombre: string;
    parejaCon: string;
    esGanador: boolean;
    esParejaA: boolean;
    setsFavor: number;
    setsContra: number;
  }> = [
    {
      jugadorId: duelo.pareja_a_j1_id,
      nombre: duelo.pareja_a_j1_nombre,
      parejaCon: duelo.pareja_a_j2_nombre,
      esGanador: duelo.ganador === "a",
      esParejaA: true,
      setsFavor: duelo.sets_pareja_a,
      setsContra: duelo.sets_pareja_b,
    },
    {
      jugadorId: duelo.pareja_a_j2_id,
      nombre: duelo.pareja_a_j2_nombre,
      parejaCon: duelo.pareja_a_j1_nombre,
      esGanador: duelo.ganador === "a",
      esParejaA: true,
      setsFavor: duelo.sets_pareja_a,
      setsContra: duelo.sets_pareja_b,
    },
    {
      jugadorId: duelo.pareja_b_j1_id,
      nombre: duelo.pareja_b_j1_nombre,
      parejaCon: duelo.pareja_b_j2_nombre,
      esGanador: duelo.ganador === "b",
      esParejaA: false,
      setsFavor: duelo.sets_pareja_b,
      setsContra: duelo.sets_pareja_a,
    },
    {
      jugadorId: duelo.pareja_b_j2_id,
      nombre: duelo.pareja_b_j2_nombre,
      parejaCon: duelo.pareja_b_j1_nombre,
      esGanador: duelo.ganador === "b",
      esParejaA: false,
      setsFavor: duelo.sets_pareja_b,
      setsContra: duelo.sets_pareja_a,
    },
  ];

  try {
    const resolvedIds = await resolveDuelo2v2RatingPlayerIds(organizadorId, duelo);
    if (resolvedIds) {
      const ratingApplied = await aplicarRatingDuelo2v2({
        id: duelo.id,
        nombre: duelo.nombre,
        ganador: duelo.ganador,
        ...resolvedIds,
      });
      if (ratingApplied) {
        console.info(`[rating] duelo 2v2 ${duelo.id}: rating actualizado`);
      }
    }
  } catch (e) {
    console.warn("[rating] duelo 2v2 sync:", e);
  }

  const touchedJugadorIds = new Set<string>();
  const syncFailures: CareerEventAssertionFailure[] = [];
  const excluded = toExcludedJugadorIdSet(params.excludeJugadorIds);

  for (const slot of slots) {
    await runPlayerParticipacionSync(
      syncFailures,
      { jugadorId: slot.jugadorId ?? undefined, nombre: slot.nombre },
      async () => {
        const { jugadorId, failure } = await resolveJugadorForEventSync(
          {
            organizadorId,
            jugadorId: slot.jugadorId,
            nombre: slot.nombre,
            tipoEvento: "duelo_2v2",
            eventoId: duelo.id,
          },
          excluded
        );
        if (failure) {
          syncFailures.push(failure);
          return;
        }
        if (!jugadorId) return;
        touchedJugadorIds.add(jugadorId);

        const posicion = slot.esGanador ? 1 : 2;
        const resultado: JugadorResultado = slot.esGanador ? "victoria" : "derrota";

        const partidosDetalle = buildDuelo2vs2PartidosDetalle({
          duelo,
          esParejaA: slot.esParejaA,
        });
        const detSummary = summarizePartidosDetalle(partidosDetalle);
        const setsFavor =
          detSummary.jugados > 0 ? detSummary.setsFavor : slot.setsFavor;
        const setsContra =
          detSummary.jugados > 0 ? detSummary.setsContra : slot.setsContra;

        const metadata = enrichMetadataWithPartidosDetalle(
          {
            subtipo: "duelo_2v2_cierre",
            modalidad: "duelo_2v2",
            modalidad_label: "Duelo 2 vs 2",
            organizador_id: organizadorId,
            club_name: getOrganizerDisplayNameSync(organizadorId),
            posicion: posicion,
            posicion_final: posicion,
            total_participantes: 4,
            lugar: slot.esGanador ? "Campeón" : "2do lugar",
            placement: slot.esGanador ? "campeon" : "subcampeon",
            campeon_torneo: slot.esGanador,
            ...(partidosDetalle.length === 0
              ? {
                  partidos_ganados: slot.esGanador ? 1 : 0,
                  partidos_perdidos: slot.esGanador ? 0 : 1,
                  partidos_jugados: 1,
                }
              : {}),
            fecha,
          },
          partidosDetalle
        );

        await registrarPuntosRanking({
          jugadorId,
          tipoEvento: "duelo_2v2",
          eventoId: duelo.id,
          eventoNombre,
          resultado,
          formato: "duelo_2v2",
          calcParams: { ganador_duelo: slot.esGanador },
          setsFavor,
          setsContra,
          parejaCon: slot.parejaCon,
          upsertSubtipo: "duelo_2v2_cierre",
          metadata,
        });
      }
    );
  }
  return {
    touchedJugadorIds: Array.from(touchedJugadorIds),
    participacionEventoId: duelo.id,
    syncFailures: syncFailures.length > 0 ? syncFailures : undefined,
  };
}

function mapDueloRowForBackfill(row: Record<string, unknown>): Duelo2v2 {
  const parseDetalleSets = (raw: unknown): Duelo2v2["detalle_sets"] => {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const o = item as Record<string, unknown>;
        const a = Number(o.a);
        const b = Number(o.b);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
        return { a, b };
      })
      .filter((x): x is { a: number; b: number } => x !== null);
  };

  return {
    id: String(row.id),
    organizador_id: String(row.organizador_id),
    nombre: String(row.nombre),
    descripcion: row.descripcion ? String(row.descripcion) : null,
    cancha: row.cancha != null ? String(row.cancha) : null,
    programado_en: row.programado_en ? String(row.programado_en) : null,
    programado_hasta: row.programado_hasta ? String(row.programado_hasta) : null,
    estado: row.estado as Duelo2v2["estado"],
    pareja_a_j1_id: row.pareja_a_j1_id ? String(row.pareja_a_j1_id) : null,
    pareja_a_j2_id: row.pareja_a_j2_id ? String(row.pareja_a_j2_id) : null,
    pareja_a_j1_nombre: String(row.pareja_a_j1_nombre),
    pareja_a_j2_nombre: String(row.pareja_a_j2_nombre),
    pareja_b_j1_id: row.pareja_b_j1_id ? String(row.pareja_b_j1_id) : null,
    pareja_b_j2_id: row.pareja_b_j2_id ? String(row.pareja_b_j2_id) : null,
    pareja_b_j1_nombre: String(row.pareja_b_j1_nombre),
    pareja_b_j2_nombre: String(row.pareja_b_j2_nombre),
    sets_pareja_a: Number(row.sets_pareja_a ?? 0),
    sets_pareja_b: Number(row.sets_pareja_b ?? 0),
    detalle_sets: parseDetalleSets(row.detalle_sets),
    ganador: (row.ganador as Duelo2v2["ganador"]) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    finalizado_at: row.finalizado_at ? String(row.finalizado_at) : null,
  };
}

/** Re-sincroniza duelos 2v2 finalizados con partidos_detalle. */
export async function backfillDuelosHistorial(
  organizadorId: string
): Promise<number> {
  let count = 0;
  try {
    const { data, error } = await supabase
      .from("duelos_2v2")
      .select("*")
      .eq("organizador_id", organizadorId)
      .eq("estado", "finalizado");

    if (error || !data?.length) return 0;

    for (const row of data) {
      const duelo = mapDueloRowForBackfill(row as Record<string, unknown>);
      if (!duelo.ganador) continue;
      const outcome = await syncDuelo2v2Participaciones({ organizadorId, duelo });
      await refreshJugadorStatsBatch(outcome.touchedJugadorIds);
      count += 1;
    }
  } catch (e) {
    console.error("[riviera-jugadores] backfillDuelosHistorial:", e);
  }
  return count;
}

export type BackfillHistorialResumen = {
  retas: number;
  americanos: number;
  ligas: number;
  duelos: number;
};

/** Re-sincroniza historial partido a partido de eventos cerrados del organizador. */
export async function backfillHistorialJugadores(
  organizadorId: string
): Promise<BackfillHistorialResumen> {
  await prepareParticipacionIdentityForOrganizer(organizadorId);
  const [retas, americanos, ligas, duelos] = await Promise.all([
    backfillRetasHistorial(organizadorId),
    backfillAmericanoHistorial(organizadorId),
    backfillLigaJornadaHistorial(organizadorId),
    backfillDuelosHistorial(organizadorId),
  ]);
  return { retas, americanos, ligas, duelos };
}
