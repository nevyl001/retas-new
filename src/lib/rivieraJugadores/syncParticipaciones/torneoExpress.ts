import { latestIsoTimestamp } from "../../matchDate";
import type { Pair } from "../../db/types";
import { fetchTorneoExpressBundle } from "../../../services/torneoExpressService";
import {
  eliminatoriaBracketSize,
  isRondaTercerLugar,
  partidosDeRonda,
  totalRondasEliminatoria,
} from "../../torneoExpress/bracketRounds";
import { clasificadosPairIdsFromBundle } from "../../torneoExpress/clasificadosPairs";
import type { TorneoExpressBundle } from "../../torneoExpress/types";
import type { TorneoExpressEliminatoriaPartido } from "../../torneoExpress/types";
import { formatLugarOrdinal } from "../historialDisplay";
import {
  resolveJugadorForEventSync,
  runParallelPlayerParticipacionSync,
  toExcludedJugadorIdSet,
  type PlayerParticipacionSyncResult,
} from "../careerEventPipeline/careerEventPlayerSync";
import type { CloseIdentityCache } from "../careerEventPipeline/closeIdentityCache";
import {
  type CareerEventSyncOutcome,
  type CareerEventSyncOptions,
  type PlayerAgg,
  hostClubMetadata,
  playerSyncFromPersist,
  registrarPuntosRanking,
  resultadoFromRecord,
  fetchPairsByIds,
  processExpressPartido,
} from "./core";

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
    // Sin partido de bronce: ambos perdedores de SF = 3.º compartido.
    // Nunca inventar un 4.º único por orden/seed/marcadores.
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

    for (const loserParejaId of semiLoserParejaIds) {
      Array.from(legacyPlayerIdsFromPair(pairMap.get(loserParejaId))).forEach(
        (id) => tercerPlayerIds.add(id)
      );
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
  excludeJugadorIds?: string[],
  eventoEn?: string,
  identityCache?: CloseIdentityCache
): Promise<CareerEventSyncOutcome> {
  const excluded = toExcludedJugadorIdSet(excludeJugadorIds);
  const parallelOutcome = await runParallelPlayerParticipacionSync(
    Array.from(agg.values()).map((st) => ({
      ctx: { nombre: st.nombre, legacyPlayerId: st.legacyPlayerId },
      fn: async (): Promise<PlayerParticipacionSyncResult> => {
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
          excluded,
          identityCache
        );
        if (failure) {
          return { failure };
        }
        if (!jugadorId) {
          return {};
        }

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

        const persisted = await registrarPuntosRanking({
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
          eventoEn,
        });

        return playerSyncFromPersist(persisted);
      },
    }))
  );

  return {
    touchedJugadorIds: parallelOutcome.touchedJugadorIds,
    syncFailures:
      parallelOutcome.syncFailures.length > 0
        ? parallelOutcome.syncFailures
        : undefined,
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
    const eventoEn = latestIsoTimestamp(
      bundle.torneo.created_at,
      ...Object.values(bundle.partidosPorGrupo)
        .flat()
        .map((partido) => partido.programado_en),
      ...bundle.eliminatoriaPartidos.map((partido) => partido.programado_en)
    );

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
      options?.excludeJugadorIds,
      eventoEn,
      options?.identityCache
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