import { useState } from "react";
import {
  Pair,
  Match,
  Tournament,
  getTournamentGames,
} from "../lib/database";
import { loadTeamConfigForTournament } from "../lib/teamConfigDisplay";
import {
  computePairsWithStats,
  computeTeamStandings,
} from "../lib/standingsUtils";
import { resolveTournamentPodiumOutcome } from "../lib/resolveTournamentOutcome";
import { loadChampionshipConfig } from "../lib/roundRobinChampionship";
import type { TeamWinnerCelebrateStats } from "../lib/teamWinnerCelebrate";
import { teamStandingRowToWinnerStats } from "../lib/teamWinnerCelebrate";
import type { TournamentWinner } from "../lib/tournamentWinner";

export const useWinnerCalculation = () => {
  const [tournamentWinner, setTournamentWinner] =
    useState<TournamentWinner | null>(null);
  const [winningTeamName, setWinningTeamName] = useState<string | null>(null);
  const [winningTeamStats, setWinningTeamStats] =
    useState<TeamWinnerCelebrateStats | null>(null);
  const [showWinnerScreen, setShowWinnerScreen] = useState(false);

  const calculateAndShowWinner = async (
    pairs: Pair[],
    matches: Match[],
    setCurrentView: (view: "main" | "winner" | "public") => void,
    options?: { tournament?: Tournament | null; skipViewChange?: boolean }
  ) => {
    try {
      const tournament = options?.tournament;
      const tid = tournament?.id;
      const teamConfig = tournament
        ? await loadTeamConfigForTournament(tournament)
        : null;

      if (teamConfig) {
        setTournamentWinner(null);
        setWinningTeamStats(null);
        const games = tournament?.id ? await getTournamentGames(tournament.id) : [];
        const pairsWithStats = computePairsWithStats(pairs, matches, games || []);
        const teamStandings = computeTeamStandings(pairsWithStats, teamConfig);
        const first = teamStandings?.[0];
        if (first) {
          setWinningTeamName(first.name);
          setWinningTeamStats(teamStandingRowToWinnerStats(first));
        } else {
          setWinningTeamName(null);
        }
        setShowWinnerScreen(true);
        if (!options?.skipViewChange) {
          setCurrentView("winner");
        }
        return;
      }

      setWinningTeamName(null);
      setWinningTeamStats(null);

      const games = tid ? await getTournamentGames(tid) : [];
      let champCfg = tid
        ? await (async () => {
            try {
              const { resolveCanonicalChampionshipConfig } = await import(
                "../lib/reta/updateRetaConfig"
              );
              return await resolveCanonicalChampionshipConfig(tid);
            } catch {
              return loadChampionshipConfig(tid);
            }
          })()
        : null;

      const outcome = await resolveTournamentPodiumOutcome(
        pairs,
        matches,
        games || [],
        tid ?? "",
        champCfg
      );
      setTournamentWinner(outcome.winner);
      setShowWinnerScreen(true);
      if (!options?.skipViewChange) {
        setCurrentView("winner");
      }
    } catch (error) {
      console.error("❌ Error al calcular ganador:", error);
      setShowWinnerScreen(true);
      if (!options?.skipViewChange) {
        setCurrentView("winner");
      }
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
