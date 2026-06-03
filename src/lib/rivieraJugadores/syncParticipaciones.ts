import type { Match, Pair, Player, Tournament } from "../db/types";
import type { AmericanoPlayer, AmericanoRound } from "../db/types";
import { getGames, getMatches, getPairs, getTournaments } from "../database";
import { computeJornadaPublicStats } from "../liga/jornadaStats";
import {
  computePairsWithStats,
  sortPairsForStandings,
} from "../standingsUtils";
import { formatLugarOrdinal, placementTorneoLabel } from "./historialDisplay";
import { supabase } from "../supabaseClient";
import {
  buildAmericanoPlayerStandingStats,
} from "../americanoStandings";
import { fetchTorneoExpressBundle } from "../../services/torneoExpressService";
import { getLigaById } from "../../services/ligaService";
import {
  eliminatoriaBracketSize,
  partidosDeRonda,
  totalRondasEliminatoria,
} from "../torneoExpress/bracketRounds";
import type { TorneoExpressBundle } from "../torneoExpress/types";
import type { TorneoExpressEliminatoriaPartido } from "../torneoExpress/types";
import {
  puntosRankingPorPlacement,
  type RivieraTePlacement,
} from "../torneoExpress/rankingPoints";
import {
  createRivieraJugador,
  getRivieraJugadorByLegacyLigaId,
  getRivieraJugadorByLegacyPlayerId,
  registrarParticipacion,
} from "./rivieraJugadoresService";
import { slugifyJugadorNombre, ensureUniqueSlug } from "./slug";
import type { JugadorResultado, JugadorTipoEvento } from "./types";

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
        params.legacyPlayerId
      );
      if (byPlayer) return byPlayer.id;
    }

    if (params.legacyLigaJugadorId) {
      const byLiga = await getRivieraJugadorByLegacyLigaId(
        params.legacyLigaJugadorId
      );
      if (byLiga) return byLiga.id;
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
      return byName.id;
    }

    const baseSlug = slugifyJugadorNombre(nombre);
    const slug = await ensureUniqueSlug(baseSlug, (s) =>
      slugExistsForOrg(params.organizadorId, s)
    );

    const insert: Record<string, unknown> = {
      nombre,
      slug,
      organizador_id: params.organizadorId,
      estado: "invitado",
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
          .update({
            legacy_player_id: params.legacyPlayerId,
            estado: "invitado",
          })
          .eq("id", createdViaService.id);
      }
      if (params.legacyLigaJugadorId) {
        await supabase
          .from("riviera_jugadores")
          .update({ legacy_liga_jugador_id: params.legacyLigaJugadorId })
          .eq("id", createdViaService.id);
      }
      return createdViaService.id;
    }

    return created?.id ?? null;
  } catch (e) {
    console.error("[riviera-jugadores] getOrCreateJugadorId:", e);
    return null;
  }
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
  try {
    await registrarParticipacion(params);
  } catch (e) {
    console.error("[riviera-jugadores] safeRegistrar:", e);
  }
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

async function flushPlayerAgg(
  agg: Map<string, PlayerAgg>,
  organizadorId: string,
  eventoId: string,
  eventoNombre: string,
  tipoEvento: JugadorTipoEvento,
  extraMetadata?: Record<string, unknown>
): Promise<void> {
  for (const st of Array.from(agg.values())) {
    const jugadorId = await getOrCreateJugadorId({
      nombre: st.nombre,
      organizadorId,
      legacyPlayerId: st.legacyPlayerId,
      legacyLigaJugadorId: st.legacyLigaJugadorId,
      email: st.email,
    });
    if (!jugadorId) continue;

    await safeRegistrar({
      jugadorId,
      tipoEvento,
      eventoId,
      eventoNombre,
      resultado: resultadoFromRecord(st.wins, st.losses, st.draws),
      setsFavor: st.setsFavor,
      setsContra: st.setsContra,
      puntosObtenidos: st.puntosObtenidos,
      metadata: {
        partidos_ganados: st.wins,
        partidos_perdidos: st.losses,
        partidos_empatados: st.draws,
        ...extraMetadata,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Reta
// ---------------------------------------------------------------------------

async function syncRetaParticipacionesInner(params: {
  organizadorId: string;
  tournament: Tournament;
  pairs: Pair[];
  matches: Match[];
}): Promise<void> {
  const { organizadorId, tournament, pairs, matches } = params;
  const pairById = new Map(pairs.map((p) => [p.id, p]));
  const agg = new Map<string, PlayerAgg>();

  const ensureAgg = (player: Player) => {
    if (!agg.has(player.id)) {
      agg.set(player.id, {
        wins: 0,
        losses: 0,
        draws: 0,
        setsFavor: 0,
        setsContra: 0,
        puntosObtenidos: 0,
        nombre: player.name,
        legacyPlayerId: player.id,
        email: player.email,
      });
    }
  };

  for (const pair of pairs) {
    if (pair.player1) ensureAgg(pair.player1);
    if (pair.player2) ensureAgg(pair.player2);
  }

  for (const match of matches.filter((m) => m.status === "finished")) {
    const pair1 = pairById.get(match.pair1_id);
    const pair2 = pairById.get(match.pair2_id);
    if (!pair1 || !pair2) continue;

    let games;
    try {
      games = await getGames(match.id);
    } catch {
      continue;
    }
    if (!games.length) continue;

    let p1Pts = 0;
    let p2Pts = 0;
    for (const g of games) {
      p1Pts += g.pair1_score ?? 0;
      p2Pts += g.pair2_score ?? 0;
    }

    const pair1Wins = p1Pts > p2Pts;
    const pair2Wins = p2Pts > p1Pts;
    if (!pair1Wins && !pair2Wins) continue;

    processExpressPartido(
      match.pair1_id,
      match.pair2_id,
      p1Pts,
      p2Pts,
      pair1Wins ? match.pair1_id : pair2Wins ? match.pair2_id : null,
      pairById,
      agg
    );
  }

  const finishedMatches = matches.filter((m) => m.status === "finished");
  const allGames: Awaited<ReturnType<typeof getGames>> = [];
  for (const m of finishedMatches) {
    try {
      const g = await getGames(m.id);
      allGames.push(...g);
    } catch {
      /* partido sin juegos */
    }
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

  const esEquipos = tournament.format === "teams";
  const modalidad = esEquipos ? "reta_equipos" : "round_robin";
  const modalidadLabel = esEquipos ? "Reta por equipos" : "Round Robin";

  for (const st of Array.from(agg.values())) {
    const jugadorId = await getOrCreateJugadorId({
      nombre: st.nombre,
      organizadorId,
      legacyPlayerId: st.legacyPlayerId,
      email: st.email,
    });
    if (!jugadorId) continue;

    const pair = pairs.find(
      (p) =>
        p.player1_id === st.legacyPlayerId || p.player2_id === st.legacyPlayerId
    );
    const rank = pair ? pairRank.get(pair.id) : undefined;

    await safeRegistrar({
      jugadorId,
      tipoEvento: "reta",
      eventoId: tournament.id,
      eventoNombre: tournament.name,
      resultado: resultadoFromRecord(st.wins, st.losses, st.draws),
      setsFavor: st.setsFavor,
      setsContra: st.setsContra,
      puntosObtenidos: st.puntosObtenidos,
      metadata: {
        partidos_ganados: st.wins,
        partidos_perdidos: st.losses,
        partidos_empatados: st.draws,
        formato: tournament.format ?? "round_robin",
        modalidad,
        modalidad_label: modalidadLabel,
        reta_id: tournament.id,
        reta_nombre: tournament.name,
        posicion: rank?.pos,
        total_participantes: rank?.total,
        lugar: rank
          ? formatLugarOrdinal(rank.pos, rank.total)
          : "Participación",
      },
    });
  }
}

/** Una participación por jugador al cerrar la reta. */
export async function syncRetaParticipaciones(params: {
  organizadorId: string;
  tournament: Tournament;
  pairs: Pair[];
  matches: Match[];
}): Promise<void> {
  try {
    await syncRetaParticipacionesInner(params);
  } catch (e) {
    console.error("[riviera-jugadores] syncRetaParticipaciones:", e);
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

function placementForPlayer(
  legacyPlayerId: string | undefined,
  campeonPlayerIds: Set<string>,
  subcampeonPlayerIds: Set<string>
): RivieraTePlacement {
  if (!legacyPlayerId) return "otro";
  if (campeonPlayerIds.has(legacyPlayerId)) return "campeon";
  if (subcampeonPlayerIds.has(legacyPlayerId)) return "subcampeon";
  return "otro";
}

function legacyPlayerIdsFromPair(pair: Pair | undefined): Set<string> {
  const ids = new Set<string>();
  if (!pair) return ids;
  if (pair.player1_id) ids.add(pair.player1_id);
  if (pair.player2_id) ids.add(pair.player2_id);
  return ids;
}

async function flushTorneoExpressPlayerAgg(
  agg: Map<string, PlayerAgg>,
  organizadorId: string,
  torneoId: string,
  eventoNombre: string,
  campeonParejaId: string,
  subcampeonParejaId: string | null,
  pairMap: Map<string, Pair>
): Promise<void> {
  const campeonPlayerIds = legacyPlayerIdsFromPair(pairMap.get(campeonParejaId));
  const subcampeonPlayerIds = subcampeonParejaId
    ? legacyPlayerIdsFromPair(pairMap.get(subcampeonParejaId))
    : new Set<string>();

  for (const st of Array.from(agg.values())) {
    const jugadorId = await getOrCreateJugadorId({
      nombre: st.nombre,
      organizadorId,
      legacyPlayerId: st.legacyPlayerId,
      legacyLigaJugadorId: st.legacyLigaJugadorId,
      email: st.email,
    });
    if (!jugadorId) continue;

    const placement = placementForPlayer(
      st.legacyPlayerId,
      campeonPlayerIds,
      subcampeonPlayerIds
    );
    const puntosRanking = puntosRankingPorPlacement(placement);

    let resultado = resultadoFromRecord(st.wins, st.losses, st.draws);
    if (placement === "campeon") resultado = "victoria";
    else if (placement === "subcampeon") resultado = "derrota";

    await safeRegistrar({
      jugadorId,
      tipoEvento: "torneo_express",
      eventoId: torneoId,
      eventoNombre,
      resultado,
      setsFavor: st.setsFavor,
      setsContra: st.setsContra,
      puntosObtenidos: puntosRanking,
      metadata: {
        partidos_ganados: st.wins,
        partidos_perdidos: st.losses,
        partidos_empatados: st.draws,
        puntos_juego_acumulados: st.puntosObtenidos,
        placement,
        lugar: placementTorneoLabel(placement),
        modalidad: "torneo_express",
        modalidad_label: "Torneo Express",
        campeon_torneo: placement === "campeon",
        subcampeon_torneo: placement === "subcampeon",
        pareja_campeon_id: campeonParejaId,
        pareja_subcampeon_id: subcampeonParejaId,
        ranking_puntos_esquema: "riviera_100_50_0",
        torneo_express_id: torneoId,
      },
    });
  }
}

export async function syncTorneoExpressParticipaciones(
  torneoId: string,
  userId: string
): Promise<void> {
  try {
    const bundle = await fetchTorneoExpressBundle(torneoId);
    if (!bundle) {
      console.error(
        "[riviera-jugadores] syncTorneoExpressParticipaciones: torneo no encontrado"
      );
      return;
    }

    if (!torneoExpressCerrado(bundle)) {
      console.warn(
        "[riviera-jugadores] syncTorneoExpressParticipaciones: torneo aún no cerrado",
        torneoId
      );
      return;
    }

    const campeonParejaId = resolveCampeonParejaId(bundle);
    if (!campeonParejaId) {
      console.warn(
        "[riviera-jugadores] syncTorneoExpressParticipaciones: final de eliminatoria sin ganador definido",
        torneoId
      );
      return;
    }

    const subcampeonParejaId = resolveSubcampeonParejaId(bundle, campeonParejaId);

    const partidoParejaIds: string[] = [campeonParejaId];
    if (subcampeonParejaId) partidoParejaIds.push(subcampeonParejaId);
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

    await flushTorneoExpressPlayerAgg(
      agg,
      userId,
      torneoId,
      bundle.torneo.nombre,
      campeonParejaId,
      subcampeonParejaId,
      pairMap
    );
  } catch (e) {
    console.error("[riviera-jugadores] syncTorneoExpressParticipaciones:", e);
  }
}

// ---------------------------------------------------------------------------
// Liga
// ---------------------------------------------------------------------------

export async function syncLigaJornada(
  ligaId: string,
  jornadaNumero: number,
  userId: string
): Promise<void> {
  try {
    const detalle = await getLigaById(ligaId);
    const jornada = detalle.jornadas.find((j) => j.numero === jornadaNumero);
    if (!jornada) {
      console.error(
        "[riviera-jugadores] syncLigaJornada: jornada no encontrada",
        jornadaNumero
      );
      return;
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
    const jornadaStats = computeJornadaPublicStats(jornada);
    const posByJugador = new Map(
      jornadaStats.rankingJugadores.map((j) => [j.jugadorId, j.posicion])
    );
    const totalJugadores = jornadaStats.rankingJugadores.length;

    for (const st of Array.from(agg.values())) {
      const jugadorId = await getOrCreateJugadorId({
        nombre: st.nombre,
        organizadorId: userId,
        legacyLigaJugadorId: st.legacyLigaJugadorId,
      });
      if (!jugadorId) continue;

      const posicion = st.legacyLigaJugadorId
        ? posByJugador.get(st.legacyLigaJugadorId)
        : undefined;

      await safeRegistrar({
        jugadorId,
        tipoEvento: "liga",
        eventoId: jornada.id,
        eventoNombre,
        resultado: resultadoFromRecord(st.wins, st.losses, st.draws),
        setsFavor: st.setsFavor,
        setsContra: st.setsContra,
        puntosObtenidos: st.puntosObtenidos,
        parejaCon: (st as PlayerAgg & { lastPareja?: string }).lastPareja,
        metadata: {
          liga_id: ligaId,
          liga_nombre: detalle.nombre,
          jornada_numero: jornada.numero,
          modalidad: "liga",
          modalidad_label: "Liga",
          posicion_jornada: posicion,
          total_participantes: totalJugadores,
          lugar:
            posicion != null && posicion > 0
              ? formatLugarOrdinal(posicion, totalJugadores)
              : "Participación en jornada",
        },
      });
    }
  } catch (e) {
    console.error("[riviera-jugadores] syncLigaJornada:", e);
  }
}

// ---------------------------------------------------------------------------
// Americano Dinámico
// ---------------------------------------------------------------------------

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
      await syncRetaParticipaciones({
        organizadorId,
        tournament: t,
        pairs,
        matches,
      });
      count += 1;
    }
  } catch (e) {
    console.error("[riviera-jugadores] backfillRetasHistorial:", e);
  }
  return count;
}

export async function syncAmericanoParticipaciones(
  sesionId: string,
  nombre: string,
  jugadores: AmericanoPlayer[],
  rounds: AmericanoRound[],
  userId: string
): Promise<void> {
  try {
    const statsMap = buildAmericanoPlayerStandingStats(jugadores, rounds);
    const eventoNombre = `Americano Dinámico - ${nombre.trim() || "Sesión"}`;

    const ranked = [...jugadores].sort((a, b) => {
      const sa = statsMap.get(a.id);
      const sb = statsMap.get(b.id);
      const pa = sa?.puntos ?? 0;
      const pb = sb?.puntos ?? 0;
      if (pb !== pa) return pb - pa;
      return a.name.localeCompare(b.name);
    });

    let posicion = 0;
    for (const jugador of ranked) {
      posicion += 1;
      const st = statsMap.get(jugador.id);
      const jugadorId = await getOrCreateJugadorId({
        nombre: jugador.name,
        organizadorId: userId,
        legacyPlayerId: jugador.id.includes("-") ? jugador.id : undefined,
      });
      if (!jugadorId) continue;

      await safeRegistrar({
        jugadorId,
        tipoEvento: "americano",
        eventoId: sesionId,
        eventoNombre,
        resultado: "participación",
        puntosObtenidos: st?.puntos ?? jugador.stats.pointsFor,
        metadata: {
          partidos: jugador.stats.gamesPlayed,
          banquillo: jugador.stats.roundsOnBench,
          posicion_final: posicion,
          posicion,
          total_participantes: ranked.length,
          lugar: formatLugarOrdinal(posicion, ranked.length),
          modalidad: "americano",
          modalidad_label: "Pádel Americano",
          puntos_a_favor: jugador.stats.pointsFor,
          puntos_en_contra: jugador.stats.pointsAgainst,
        },
      });
    }
  } catch (e) {
    console.error("[riviera-jugadores] syncAmericanoParticipaciones:", e);
  }
}
