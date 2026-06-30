import type { Match, Pair } from "../database";
import type { Game } from "../database";
import { supabase } from "../supabaseClient";
import { getMatchScoresForStandings } from "../standingsUtils";
import { getOrCreateJugadorId } from "./jugadorIdResolver";
import {
  parseSetScoresJson,
  resolveParejasFijasPartidoTotals,
} from "../liga/parejasFijasMatchScore";

export type RatingModoJuego =
  | "reta_rr"
  | "reta_equipos"
  | "torneo"
  | "torneo_eliminatoria"
  | "americano"
  | "duelo_2v2"
  | "liga";

export interface AplicarRatingPartidoParams {
  j1: string;
  j2: string;
  j3: string;
  j4: string;
  ganador: "a" | "b";
  modoJuego: RatingModoJuego;
  partidoRef: string;
  descripcion?: string;
}

function isMissingRatingRpc(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    msg.includes("aplicar_rating_partido") ||
    msg.includes("could not find the function")
  );
}

/** Re-importar historial vuelve a llamar al RPC; el partido ya puede estar registrado. */
function isDuplicateRatingHistorialError(
  error: { code?: string; message?: string; details?: string; status?: number } | null
): boolean {
  if (!error) return false;
  const msg = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return (
    error.status === 409 ||
    error.code === "23505" ||
    msg.includes("rating_historial_jugador_partido_uidx") ||
    msg.includes("duplicate key value") ||
    msg.includes("conflict")
  );
}

async function ratingPartidoYaAplicado(
  partidoRef: string,
  jugadorId: string
): Promise<boolean> {
  if (!partidoRef || !jugadorId) return false;
  const { data, error } = await supabase
    .from("rating_historial")
    .select("id")
    .eq("partido_ref", partidoRef)
    .eq("jugador_id", jugadorId)
    .limit(1)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

/** Llama al RPC de Supabase que actualiza rating de los 4 jugadores. */
export async function aplicarRatingPartido(
  params: AplicarRatingPartidoParams
): Promise<boolean> {
  const { j1, j2, j3, j4, ganador, modoJuego, partidoRef, descripcion } = params;
  if (!j1 || !j2 || !j3 || !j4) return false;

  if (partidoRef && (await ratingPartidoYaAplicado(partidoRef, j1))) {
    return true;
  }

  const { error } = await supabase.rpc("aplicar_rating_partido", {
    p_j1: j1,
    p_j2: j2,
    p_j3: j3,
    p_j4: j4,
    p_ganador: ganador,
    p_modo_juego: modoJuego,
    p_partido_ref: partidoRef,
    p_descripcion: descripcion ?? null,
  });

  if (error) {
    if (isMissingRatingRpc(error)) {
      console.warn(
        "[rating] RPC aplicar_rating_partido no disponible. Ejecuta supabase/rating-sistema.sql"
      );
      return false;
    }
    if (isDuplicateRatingHistorialError(error)) {
      return true;
    }
    console.error("[rating] RPC error:", error.message, error.code, error);
    throw error;
  }

  return true;
}

/** No bloquea el guardado del partido si falla el rating. */
export function aplicarRatingPartidoSafe(
  params: AplicarRatingPartidoParams
): void {
  void aplicarRatingPartido(params).catch((e) => {
    console.warn("[rating] aplicarRatingPartido:", e);
  });
}

export async function resolverRivieraIdsDesdePair(
  organizadorId: string,
  pair: Pick<Pair, "player1_id" | "player2_id" | "player1_name" | "player2_name">
): Promise<[string, string] | null> {
  const j1 = await getOrCreateJugadorId({
    organizadorId,
    legacyPlayerId: pair.player1_id,
    nombre: pair.player1_name || "Jugador 1",
  });
  const j2 = await getOrCreateJugadorId({
    organizadorId,
    legacyPlayerId: pair.player2_id,
    nombre: pair.player2_name || "Jugador 2",
  });
  if (!j1 || !j2) return null;
  return [j1, j2];
}

export async function aplicarRatingDesdePairs(
  organizadorId: string,
  pairA: Pick<Pair, "player1_id" | "player2_id" | "player1_name" | "player2_name">,
  pairB: Pick<Pair, "player1_id" | "player2_id" | "player1_name" | "player2_name">,
  ganador: "a" | "b",
  opts: {
    modoJuego: RatingModoJuego;
    partidoRef: string;
    descripcion?: string;
  }
): Promise<void> {
  const [a1, a2] = (await resolverRivieraIdsDesdePair(organizadorId, pairA)) ?? [];
  const [b1, b2] = (await resolverRivieraIdsDesdePair(organizadorId, pairB)) ?? [];
  if (!a1 || !a2 || !b1 || !b2) return;

  await aplicarRatingPartido({
    j1: a1,
    j2: a2,
    j3: b1,
    j4: b2,
    ganador,
    modoJuego: opts.modoJuego,
    partidoRef: opts.partidoRef,
    descripcion: opts.descripcion,
  });
}

export async function resolverRivieraIdsLigaPareja(
  organizadorId: string,
  jugador1Id: string,
  jugador2Id: string,
  nombre1: string,
  nombre2: string
): Promise<[string, string] | null> {
  const j1 = await getOrCreateJugadorId({
    organizadorId,
    legacyLigaJugadorId: jugador1Id,
    nombre: nombre1,
  });
  const j2 = await getOrCreateJugadorId({
    organizadorId,
    legacyLigaJugadorId: jugador2Id,
    nombre: nombre2,
  });
  if (!j1 || !j2) return null;
  return [j1, j2];
}

const PAIRS_SELECT_RATING =
  "id, player1_id, player2_id, player1_name, player2_name";

async function fetchPairsForRating(pairIds: string[]) {
  const { data } = await supabase
    .from("pairs")
    .select(PAIRS_SELECT_RATING)
    .in("id", pairIds);
  return (data ?? []) as Array<
    Pick<Pair, "id" | "player1_id" | "player2_id" | "player1_name" | "player2_name">
  >;
}

export async function aplicarRatingTorneoExpressGrupoPartido(
  partidoId: string,
  puntosLocal: number,
  puntosVisitante: number
): Promise<void> {
  if (puntosLocal === puntosVisitante) return;

  const { data: partido } = await supabase
    .from("torneo_express_partidos")
    .select("pareja_local_id, pareja_visitante_id, grupo_id")
    .eq("id", partidoId)
    .maybeSingle();
  if (!partido?.grupo_id) return;

  const { data: grupo } = await supabase
    .from("torneo_express_grupos")
    .select("torneo_id")
    .eq("id", partido.grupo_id)
    .maybeSingle();
  if (!grupo?.torneo_id) return;

  const { data: torneo } = await supabase
    .from("torneo_express")
    .select("organizador_id, nombre")
    .eq("id", grupo.torneo_id)
    .maybeSingle();
  const organizadorId = torneo?.organizador_id
    ? String(torneo.organizador_id)
    : "";
  if (!organizadorId) return;

  const pairs = await fetchPairsForRating([
    String(partido.pareja_local_id),
    String(partido.pareja_visitante_id),
  ]);
  const local = pairs.find((p) => p.id === partido.pareja_local_id);
  const visit = pairs.find((p) => p.id === partido.pareja_visitante_id);
  if (!local || !visit) return;

  const ganador = puntosLocal > puntosVisitante ? "a" : "b";
  await aplicarRatingDesdePairs(organizadorId, local, visit, ganador, {
    modoJuego: "torneo",
    partidoRef: `te-grupo:${partidoId}`,
    descripcion: torneo?.nombre ? `Torneo: ${torneo.nombre}` : undefined,
  });
}

export async function aplicarRatingTorneoExpressEliminatoriaPartido(
  partidoId: string,
  ganadorSide: "local" | "visitante",
  torneoId: string
): Promise<void> {
  const { data: partido } = await supabase
    .from("torneo_express_eliminatoria_partidos")
    .select("pareja_local_id, pareja_visitante_id")
    .eq("id", partidoId)
    .maybeSingle();
  if (!partido) return;

  const { data: torneo } = await supabase
    .from("torneo_express")
    .select("organizador_id, nombre")
    .eq("id", torneoId)
    .maybeSingle();
  const organizadorId = torneo?.organizador_id
    ? String(torneo.organizador_id)
    : "";
  if (!organizadorId) return;

  const pairs = await fetchPairsForRating([
    String(partido.pareja_local_id),
    String(partido.pareja_visitante_id),
  ]);
  const local = pairs.find((p) => p.id === partido.pareja_local_id);
  const visit = pairs.find((p) => p.id === partido.pareja_visitante_id);
  if (!local || !visit) return;

  const ganador = ganadorSide === "local" ? "a" : "b";
  await aplicarRatingDesdePairs(organizadorId, local, visit, ganador, {
    modoJuego: "torneo_eliminatoria",
    partidoRef: `te-elim:${partidoId}`,
    descripcion: torneo?.nombre ? `Eliminatoria: ${torneo.nombre}` : undefined,
  });
}

export async function aplicarRatingDuelo2v2(duelo: {
  id: string;
  nombre: string;
  ganador: "a" | "b" | null;
  pareja_a_j1_id: string | null;
  pareja_a_j2_id: string | null;
  pareja_b_j1_id: string | null;
  pareja_b_j2_id: string | null;
}): Promise<boolean> {
  if (!duelo.ganador) return false;
  const j1 = duelo.pareja_a_j1_id;
  const j2 = duelo.pareja_a_j2_id;
  const j3 = duelo.pareja_b_j1_id;
  const j4 = duelo.pareja_b_j2_id;
  if (!j1 || !j2 || !j3 || !j4) return false;

  return aplicarRatingPartido({
    j1,
    j2,
    j3,
    j4,
    ganador: duelo.ganador,
    modoJuego: "duelo_2v2",
    partidoRef: `duelo2v2:${duelo.id}`,
    descripcion: duelo.nombre,
  });
}

export async function aplicarRatingLigaPartido(
  partidoId: string,
  organizadorId: string
): Promise<void> {
  const { data: partido } = await supabase
    .from("liga_partidos")
    .select(
      "id, pareja1_id, pareja2_id, score_pareja1, score_pareja2, set_scores"
    )
    .eq("id", partidoId)
    .maybeSingle();
  if (!partido) return;

  const totals = resolveParejasFijasPartidoTotals({
    score_pareja1:
      partido.score_pareja1 != null ? Number(partido.score_pareja1) : null,
    score_pareja2:
      partido.score_pareja2 != null ? Number(partido.score_pareja2) : null,
    set_scores: parseSetScoresJson(
      (partido as { set_scores?: unknown }).set_scores
    ),
  });
  if (!totals) return;

  const { data: parejas } = await supabase
    .from("liga_jornada_parejas")
    .select(
      "id, jugador1_id, jugador2_id, jugador1:liga_jugadores(nombre), jugador2:liga_jugadores(nombre)"
    )
    .in("id", [partido.pareja1_id, partido.pareja2_id]);

  type ParejaRow = {
    id: string;
    jugador1_id: string;
    jugador2_id: string;
    jugador1?: { nombre?: string } | { nombre?: string }[];
    jugador2?: { nombre?: string } | { nombre?: string }[];
  };

  const list = (parejas ?? []) as ParejaRow[];
  const p1 = list.find((p) => p.id === partido.pareja1_id);
  const p2 = list.find((p) => p.id === partido.pareja2_id);
  if (!p1 || !p2) return;

  const nombre = (j: { nombre?: string } | { nombre?: string }[] | undefined) => {
    if (!j) return "Jugador";
    if (Array.isArray(j)) return j[0]?.nombre ?? "Jugador";
    return j.nombre ?? "Jugador";
  };

  const teamA = await resolverRivieraIdsLigaPareja(
    organizadorId,
    String(p1.jugador1_id),
    String(p1.jugador2_id),
    nombre(p1.jugador1),
    nombre(p1.jugador2)
  );
  const teamB = await resolverRivieraIdsLigaPareja(
    organizadorId,
    String(p2.jugador1_id),
    String(p2.jugador2_id),
    nombre(p2.jugador1),
    nombre(p2.jugador2)
  );
  if (!teamA || !teamB) return;

  aplicarRatingPartidoSafe({
    j1: teamA[0],
    j2: teamA[1],
    j3: teamB[0],
    j4: teamB[1],
    ganador: totals.p1WonMatch ? "a" : "b",
    modoJuego: "liga",
    partidoRef: `liga:${partidoId}`,
    descripcion: "Liga · jornada",
  });
}

export async function aplicarRatingAmericanoPartido(
  organizadorId: string,
  match: {
    id: string;
    scoreA?: number;
    scoreB?: number;
    teamA: [{ id: string; name: string }, { id: string; name: string }];
    teamB: [{ id: string; name: string }, { id: string; name: string }];
  }
): Promise<void> {
  const scoreA = match.scoreA;
  const scoreB = match.scoreB;
  if (
    scoreA == null ||
    scoreB == null ||
    !Number.isFinite(scoreA) ||
    !Number.isFinite(scoreB) ||
    scoreA === scoreB
  ) {
    return;
  }

  const [a1, a2, b1, b2] = await Promise.all([
    getOrCreateJugadorId({
      organizadorId,
      legacyPlayerId: match.teamA[0].id,
      nombre: match.teamA[0].name,
    }),
    getOrCreateJugadorId({
      organizadorId,
      legacyPlayerId: match.teamA[1].id,
      nombre: match.teamA[1].name,
    }),
    getOrCreateJugadorId({
      organizadorId,
      legacyPlayerId: match.teamB[0].id,
      nombre: match.teamB[0].name,
    }),
    getOrCreateJugadorId({
      organizadorId,
      legacyPlayerId: match.teamB[1].id,
      nombre: match.teamB[1].name,
    }),
  ]);
  if (!a1 || !a2 || !b1 || !b2) return;

  aplicarRatingPartidoSafe({
    j1: a1,
    j2: a2,
    j3: b1,
    j4: b2,
    ganador: scoreA > scoreB ? "a" : "b",
    modoJuego: "americano",
    partidoRef: `americano:${match.id}`,
    descripcion: "Americano",
  });
}

/** Aplica rating a todos los partidos finalizados de una reta (idempotente). */
export async function aplicarRatingRetaFinishedMatches(params: {
  organizadorId: string;
  pairs: Pair[];
  matches: Match[];
  gamesByMatchId: Map<string, Game[]>;
  descripcion?: string;
}): Promise<number> {
  const { organizadorId, pairs, matches, gamesByMatchId, descripcion } =
    params;
  const pairById = new Map(pairs.map((p) => [p.id, p]));
  let applied = 0;

  for (const match of matches.filter((m) => m.status === "finished")) {
    const pair1 = pairById.get(match.pair1_id);
    const pair2 = pairById.get(match.pair2_id);
    if (!pair1 || !pair2) continue;

    const games = gamesByMatchId.get(match.id) ?? [];
    const { score1, score2 } = getMatchScoresForStandings(match, games);
    if (score1 === score2) continue;

    try {
      await aplicarRatingDesdePairs(
        organizadorId,
        pair1,
        pair2,
        score1 > score2 ? "a" : "b",
        {
          modoJuego: "reta_rr",
          partidoRef: `reta:${match.id}`,
          descripcion: descripcion ?? "Reta Round Robin",
        }
      );
      applied += 1;
    } catch (e) {
      console.warn("[rating] reta partido", match.id, e);
    }
  }

  return applied;
}
