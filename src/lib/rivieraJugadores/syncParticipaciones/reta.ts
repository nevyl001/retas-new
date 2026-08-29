import type { Match, Pair, Tournament } from "../../db/types";
import { errorMessageWithCode } from "../../errors/normalizeError";
import { getGames, getMatches, getPairs, getTournaments } from "../../database";
import { latestIsoTimestamp } from "../../matchDate";
import { supabase } from "../../supabaseClient";
import {
  computePairsWithStats,
  sortPairsForStandings,
  computeTeamStandings,
  getMatchScoresForStandings,
  getTeamConfigFromStorage,
} from "../../standingsUtils";
import {
  computeDynamicTeamStandings,
  resolveDynamicTeamWinner,
} from "../../reta/dynamicTeamLineups";
import { matchesForStandingsTable } from "../../resolveTournamentOutcome";
import {
  loadChampionshipConfig,
  partitionMatches,
  resolveChampionshipPodium,
  resolveRegularRoundsMax,
} from "../../roundRobinChampionship";
import { formatLugarOrdinal } from "../historialDisplay";
import {
  buildPartidosDetalleByLegacyPlayerId,
  loadGamesByMatchId,
} from "../buildRetaPartidosDetalle";
import {
  resolveJugadorForEventSync,
  runParallelPlayerParticipacionSync,
  toExcludedJugadorIdSet,
  type PlayerParticipacionSyncResult,
} from "../careerEventPipeline/careerEventPlayerSync";
import { addStageMs, withStage } from "../careerEventPipeline/pipelineTelemetry";
import type { CloseIdentityCache } from "../careerEventPipeline/closeIdentityCache";
import {
  runRetaPairLegacyRepairsGrouped,
  type RetaPlayerPreResolveEntry,
} from "../repairRetaPairLegacyIds";
import {
  enrichMetadataWithPartidosDetalle,
  summarizePartidosDetalle,
} from "../../shared/buildPartidosDetalle";
import { aplicarRatingRetaFinishedMatches } from "../aplicarRatingPartido";
import type { RivieraRankingFormato } from "../rivieraRankingPoints";
import {
  type CareerEventSyncOutcome,
  type PlayerAgg,
  hostClubMetadata,
  playerSyncFromPersist,
  registrarPuntosRanking,
  resultadoFromRecord,
  processExpressPartido,
  refreshJugadorStatsBatch,
} from "./core";

// ---------------------------------------------------------------------------
// Reta
// ---------------------------------------------------------------------------

async function syncRetaParticipacionesInner(params: {
  organizadorId: string;
  tournament: Tournament;
  pairs: Pair[];
  matches: Match[];
  excludeJugadorIds?: string[];
  identityCache?: CloseIdentityCache;
}): Promise<CareerEventSyncOutcome> {
  const { organizadorId, tournament, pairs, matches, identityCache } = params;
  const excluded = toExcludedJugadorIdSet(params.excludeJugadorIds);

  // Incidente 2026-08-06: prepareParticipacionIdentityForOrganizer ya se
  // llamó en pipeline.ts (processCareerEvent) antes de sync, mismo ciclo de
  // cierre -- era un segundo llamado idéntico, confirmado redundante
  // (medido: prepareGrantedPlayersForParticipacionSync es una operación de
  // organizador completa, no por-jugador). syncLegacyPlayersFromRivieraRegistry
  // sí es una operación distinta (linkea legacy players del registro propio,
  // no de grants) y se conserva.
  await withStage("resolveIdentitiesMs", async () => {
    try {
      const { syncLegacyPlayersFromRivieraRegistry } = await import(
        "../playerPoolSync"
      );
      await syncLegacyPlayersFromRivieraRegistry(organizadorId, { force: true });
    } catch (e) {
      console.warn("[riviera-jugadores] syncReta legacy pool:", e);
    }
  });
  const collectPlayerRefsStart = performance.now();
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
  const eventoEn = latestIsoTimestamp(
    ...finishedMatches.map((match) => match.created_at),
    tournament.created_at
  );
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
  addStageMs("collectPlayerRefsMs", performance.now() - collectPlayerRefsStart);

  const esEquipos = tournament.format === "teams";
  const modalidad = esEquipos ? "reta_equipos" : "round_robin";
  const modalidadLabel = esEquipos ? "Reta por equipos" : "Reta";

  // Equipos con alineación dinámica: la config estática vive en
  // `tournament.team_config` (dato fresco de BD, ya recibido como parámetro
  // de esta función) -- a propósito NO se usa `getTeamConfigFromStorage`
  // (localStorage) para esta rama nueva, para no heredar la fragilidad ya
  // existente de Equipos clásico (ver auditoría: el cierre de Equipos
  // clásico puede perder silenciosamente la config si se cierra desde otro
  // dispositivo/sesión). Equipos clásico no se toca.
  const isDynamicTeams = esEquipos && tournament.team_config?.dynamicLineups?.enabled === true;

  let winningTeamIndex: number | null = null;
  const teamPosByIndex = new Map<number, number>();
  const teamConfig = isDynamicTeams
    ? (tournament.team_config ?? null)
    : esEquipos
      ? getTeamConfigFromStorage(tournament.id)
      : null;
  if (isDynamicTeams && teamConfig) {
    const dynamicRows = computeDynamicTeamStandings(pairs, matches, allGames, teamConfig);
    if (dynamicRows) {
      const outcome = resolveDynamicTeamWinner(dynamicRows);
      winningTeamIndex = outcome.winningTeamIndex;
      dynamicRows.forEach((row, i) => {
        teamPosByIndex.set(row.teamIndex, i + 1);
      });
    }
  } else if (esEquipos && teamConfig) {
    const teamRows = computeTeamStandings(sortedPairs, teamConfig);
    winningTeamIndex = teamRows?.[0]?.teamIndex ?? null;
    teamRows?.forEach((row, i) => {
      teamPosByIndex.set(row.teamIndex, i + 1);
    });
  }

  const formatoRanking: RivieraRankingFormato = esEquipos
    ? "reta_equipos"
    : "reta";

  const repairPlayers = Array.from(agg.values())
    .filter((st): st is PlayerAgg & { legacyPlayerId: string } =>
      Boolean(st.legacyPlayerId?.trim())
    )
    .map((st) => ({
      legacyPlayerId: st.legacyPlayerId,
      nombre: st.nombre,
      email: st.email ?? undefined,
    }));

  const legacyRepairStart = performance.now();
  const { resolvedByLegacyId, failures: repairFailures } =
    await runRetaPairLegacyRepairsGrouped({
      tournamentId: tournament.id,
      organizadorId,
      pairs,
      players: repairPlayers,
      excluded,
      identityCache,
    });
  addStageMs("resolveIdentitiesMs", performance.now() - legacyRepairStart);

  const registerParticipationsStart = performance.now();
  const parallelOutcome = await runParallelPlayerParticipacionSync(
    Array.from(agg.values()).map((st) => ({
      ctx: { nombre: st.nombre, legacyPlayerId: st.legacyPlayerId },
      fn: async (): Promise<PlayerParticipacionSyncResult> => {
        const preResolved: RetaPlayerPreResolveEntry | undefined = st.legacyPlayerId
          ? resolvedByLegacyId.get(st.legacyPlayerId)
          : undefined;

        if (preResolved?.failure) {
          return { failure: preResolved.failure };
        }

        let jugadorId = preResolved?.jugadorId ?? null;
        let failure = preResolved?.failure ?? undefined;

        if (!jugadorId) {
          const resolved = await resolveJugadorForEventSync(
            {
              nombre: st.nombre,
              organizadorId,
              legacyPlayerId: st.legacyPlayerId,
              email: st.email,
              tipoEvento: "reta",
              eventoId: tournament.id,
            },
            excluded,
            identityCache
          );
          jugadorId = resolved.jugadorId;
          failure = resolved.failure;
        }

        if (failure) {
          return { failure };
        }
        if (!jugadorId) {
          console.warn("[riviera-jugadores] syncReta sin jugador resuelto:", {
            retaId: tournament.id,
            retaNombre: tournament.name,
            nombre: st.nombre,
            legacyPlayerId: st.legacyPlayerId,
          });
          return {};
        }

        const pair = pairs.find(
          (p) =>
            p.player1_id === st.legacyPlayerId || p.player2_id === st.legacyPlayerId
        );

        // Perf batch-1 (2026-08-08): antes eran 2 SELECT separados a
        // riviera_jugadores para el MISMO jugadorId (uno por legacy_player_id
        // /nombre, otro más abajo por categoria) -- se combinan en 1.
        const { data: jugadorRiviera } = await supabase
          .from("riviera_jugadores")
          .select("legacy_player_id, nombre, categoria")
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

        const perfilRiviera = jugadorRiviera;

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

        const persisted = await registrarPuntosRanking({
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
          eventoEn,
        });

        return playerSyncFromPersist(persisted);
      },
    }))
  );
  // NOTA telemetry: participación local + ledger oficial van en la MISMA RPC
  // transaccional (registrarParticipacionConLedger, ver BLK-04 /
  // supabase/migrations/0005_participacion_con_ledger.sql) -- no hay un
  // round-trip de red separado para ledger que medir aparte de
  // registerParticipationsMs en este pipeline.
  addStageMs(
    "registerParticipationsMs",
    performance.now() - registerParticipationsStart
  );

  const syncFailures = [...repairFailures, ...parallelOutcome.syncFailures];
  const touchedJugadorIds = Array.from(new Set(parallelOutcome.touchedJugadorIds));

  const persistenceBatchOk =
    syncFailures.length === 0 && touchedJugadorIds.length > 0;

  const ratingStart = performance.now();
  try {
    if (!persistenceBatchOk) {
      if (syncFailures.length > 0) {
        console.warn(
          `[rating] reta ${tournament.id}: omitido — historial incompleto (${syncFailures.length} syncFailure(s), touched=${touchedJugadorIds.length})`
        );
      }
    } else {
      const ratingApplied = await aplicarRatingRetaFinishedMatches({
        organizadorId,
        pairs,
        matches,
        gamesByMatchId,
        descripcion: tournament.name?.trim()
          ? `Reta: ${tournament.name.trim()}`
          : "Reta Round Robin",
        // Perf batch-1: mismo caché de identidad de este cierre (participación
        // + rating comparten jugadores en round robin) -- evita re-resolver
        // identidad de un jugador que ya se resolvió en registrarPuntosRanking.
        identityCache,
      });
      if (ratingApplied > 0) {
        console.warn(`[rating] reta ${tournament.id}: ${ratingApplied} partido(s)`);
      }
    }
  } catch (e) {
    console.warn("[rating] sync reta:", e);
  } finally {
    addStageMs("ratingMs", performance.now() - ratingStart);
  }

  return {
    touchedJugadorIds,
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
  identityCache?: CloseIdentityCache;
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
          message: errorMessageWithCode(e),
        },
      ],
    };
  }
}

/**
 * Reconstruye participaciones desde retas ya finalizadas (actualiza lugar y modalidad).
 */
export async function backfillRetasHistorial(organizadorId: string): Promise<number> {
  let count = 0;
  try {
    // Incluye archivadas: el soft-archive no debe impedir repair/backfill de carrera.
    const tournaments = await getTournaments(organizadorId, {
      includeArchived: true,
    });
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