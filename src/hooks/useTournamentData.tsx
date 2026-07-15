import { useState, useCallback, useRef } from "react";
import {
  Tournament,
  Pair,
  Match,
  getPairs,
  getMatches,
  getTournamentGames,
} from "../lib/database";
import { repairMatchCourtRotation } from "../lib/circleRoundRobinSchedule";
import { isTeamsTournament } from "../lib/gameModeMapping";
import { syncChampionshipConfigFromPublic } from "../lib/roundRobinChampionship";
import { debugLog } from "../lib/debug/debugLog";

export const useTournamentData = () => {
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [pairStats, setPairStats] = useState<
    Map<string, { sets: number; matches: number; points: number }>
  >(new Map());
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [championshipRevision, setChampionshipRevision] = useState(0);
  const isLoadingRef = useRef(false); // Prevenir múltiples recargas simultáneas

  const calculatePairStatistics = async (
    pairsData: Pair[],
    matchesData: Match[],
    tournamentId: string
  ) => {
    const statsMap = new Map<
      string,
      { sets: number; matches: number; points: number }
    >();

    // Inicializar estadísticas para todas las parejas
    pairsData.forEach((pair) => {
      statsMap.set(pair.id, { sets: 0, matches: 0, points: 0 });
    });

    try {
      const allGames = await getTournamentGames(tournamentId);
      debugLog("[tournament-data] juegos cargados:", allGames.length);

      // Procesar cada partido finalizado
      matchesData.forEach((match) => {
        if (match.status === "finished") {
          const matchGames = allGames.filter(
            (game) => game.match_id === match.id
          );
          const pair1Stats = statsMap.get(match.pair1_id);
          const pair2Stats = statsMap.get(match.pair2_id);

          if (pair1Stats && pair2Stats) {
            pair1Stats.matches += 1;
            pair2Stats.matches += 1;

            if (matchGames.length > 0) {
              let pair1Sets = 0;
              let pair2Sets = 0;
              let pair1Points = 0;
              let pair2Points = 0;

              matchGames.forEach((game) => {
                if (game.pair1_games >= 6) pair1Sets++;
                if (game.pair2_games >= 6) pair2Sets++;
                pair1Points += game.pair1_games || 0;
                pair2Points += game.pair2_games || 0;
              });

              pair1Stats.sets += pair1Sets;
              pair1Stats.points += pair1Points;
              pair2Stats.sets += pair2Sets;
              pair2Stats.points += pair2Points;
            } else if (
              match.pair1_score !== undefined &&
              match.pair2_score !== undefined
            ) {
              pair1Stats.sets += match.pair1_score;
              pair1Stats.points += match.pair1_score;
              pair2Stats.sets += match.pair2_score;
              pair2Stats.points += match.pair2_score;
            }
          }
        }
      });

      debugLog("[tournament-data] estadísticas calculadas para", statsMap.size, "parejas");
      setPairStats(statsMap);
    } catch (error) {
      console.error("Error calculando estadísticas:", error);
    }
  };

  const loadTournamentData = useCallback(async (tournament: Tournament) => {
    if (!tournament) return;

    // Prevenir múltiples recargas simultáneas
    if (isLoadingRef.current) {
      debugLog("[tournament-data] recarga ya en progreso, ignorando");
      return;
    }

    try {
      isLoadingRef.current = true;
      setLoading(true);
      setLoadError(null);

      const [pairsData, matchesData] = await Promise.all([
        getPairs(tournament.id),
        getMatches(tournament.id),
      ]);

      debugLog(
        "[tournament-data] cargado:",
        pairsData.length,
        "parejas,",
        matchesData.length,
        "partidos"
      );
      setPairs(pairsData);

      let resolvedMatches = matchesData;
      if (matchesData.length > 0 && !isTeamsTournament(tournament)) {
        resolvedMatches = await repairMatchCourtRotation(
          pairsData,
          tournament.courts,
          matchesData,
          isTeamsTournament(tournament) ? "teams" : tournament.format
        );
      }

      setMatches(resolvedMatches);

      await syncChampionshipConfigFromPublic(tournament.id);
      setChampionshipRevision((n) => n + 1);

      await calculatePairStatistics(pairsData, resolvedMatches, tournament.id);
    } catch (err) {
      console.error("Error loading tournament data:", err);
      setLoadError("No se pudieron cargar los datos de la reta. Revisa tu conexión e inténtalo de nuevo.");
      throw err;
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  }, []);

  return {
    pairs,
    setPairs,
    matches,
    setMatches,
    pairStats,
    loading,
    loadTournamentData,
    championshipRevision,
    loadError,
  };
};
