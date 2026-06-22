import { useState } from "react";
import {
  Pair,
  Match,
  Tournament,
  getTournamentGames,
  getTournamentPublicConfig,
  getTournamentPublicConfigExtended,
  getTournamentById,
} from "../lib/database";
import {
  computePairsWithStats,
  computeTeamStandings,
  getTeamConfigFromStorage,
  inferTeamConfigFromPairs,
  fallbackTwoTeamsFromPairs,
  type TeamConfig,
} from "../lib/standingsUtils";
import { resolveTournamentPodiumOutcome } from "../lib/resolveTournamentOutcome";
import {
  loadChampionshipConfig,
  parseChampionshipConfig,
} from "../lib/roundRobinChampionship";
import type { TournamentWinner } from "../lib/tournamentWinner";

export const useWinnerCalculation = () => {
  const [tournamentWinner, setTournamentWinner] =
    useState<TournamentWinner | null>(null);
  const [winningTeamName, setWinningTeamName] = useState<string | null>(null);
  const [winningTeamStats, setWinningTeamStats] = useState<{ points: number; setsWon: number; matchesPlayed: number } | null>(null);
  const [showWinnerScreen, setShowWinnerScreen] = useState(false);

  const calculateAndShowWinner = async (
    pairs: Pair[],
    matches: Match[],
    setCurrentView: (view: "main" | "winner" | "public") => void,
    options?: { tournament?: Tournament | null }
  ) => {
    try {
      const tournament = options?.tournament;
      const tid = tournament?.id;

      let teamConfig: TeamConfig | null =
        tournament?.format === "teams" &&
        tournament?.team_config?.teamNames?.length &&
        tournament?.team_config?.pairToTeam
          ? tournament.team_config
          : null;

      let formatIsTeams =
        tournament?.format === "teams";

      if (tid) {
        const fromStorage = getTeamConfigFromStorage(tid);
        try {
          const [publicCfg, freshT] = await Promise.all([
            getTournamentPublicConfig(tid),
            getTournamentById(tid),
          ]);
          if (freshT?.format === "teams" || publicCfg?.format === "teams") {
            formatIsTeams = true;
          }
          const fromPublic =
            publicCfg?.format === "teams" &&
            publicCfg?.team_config?.teamNames?.length &&
            publicCfg?.team_config?.pairToTeam
              ? publicCfg.team_config
              : null;
          const fromRow =
            freshT?.format === "teams" &&
            freshT?.team_config?.teamNames?.length &&
            freshT?.team_config?.pairToTeam
              ? freshT.team_config
              : null;
          teamConfig = teamConfig ?? fromPublic ?? fromRow ?? fromStorage;
        } catch {
          teamConfig = teamConfig ?? fromStorage;
        }
      }

      if (formatIsTeams && !teamConfig && pairs.length >= 2) {
        teamConfig =
          inferTeamConfigFromPairs(pairs) ?? fallbackTwoTeamsFromPairs(pairs);
      }

      const isTeams = !!teamConfig;

      if (isTeams && teamConfig) {
        setTournamentWinner(null);
        setWinningTeamStats(null);
        const games = tournament?.id ? await getTournamentGames(tournament.id) : [];
        const pairsWithStats = computePairsWithStats(pairs, matches, games || []);
        const teamStandings = computeTeamStandings(pairsWithStats, teamConfig);
        const first = teamStandings?.[0];
        if (first) {
          setWinningTeamName(first.name);
          setWinningTeamStats({ points: first.points, setsWon: first.setsWon, matchesPlayed: first.matchesPlayed });
        } else {
          setWinningTeamName(null);
        }
        setShowWinnerScreen(true);
        setCurrentView("winner");
        return;
      }

      setWinningTeamName(null);
      setWinningTeamStats(null);

      const games = tid ? await getTournamentGames(tid) : [];
      let champCfg = tid ? loadChampionshipConfig(tid) : null;
      if (tid && !champCfg) {
        try {
          const publicCfg = await getTournamentPublicConfigExtended(tid);
          champCfg = parseChampionshipConfig(publicCfg?.championship_config);
        } catch {
          /* ignore */
        }
      }

      const outcome = await resolveTournamentPodiumOutcome(
        pairs,
        matches,
        games || [],
        tid ?? "",
        champCfg
      );
      setTournamentWinner(outcome.winner);
      setShowWinnerScreen(true);
      setCurrentView("winner");
    } catch (error) {
      console.error("❌ Error al calcular ganador:", error);
      setShowWinnerScreen(true);
      setCurrentView("winner");
    }
  };

  const hideWinnerScreen = (
    setCurrentView: (view: "main" | "winner" | "public") => void
  ) => {
    setShowWinnerScreen(false);
    setWinningTeamName(null);
    setWinningTeamStats(null);
    setCurrentView("main");
  };

  return {
    tournamentWinner,
    winningTeamName,
    winningTeamStats,
    showWinnerScreen,
    calculateAndShowWinner,
    hideWinnerScreen,
  };
};
