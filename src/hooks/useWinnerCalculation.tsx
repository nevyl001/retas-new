import { useState } from "react";
import { Pair, Match, Tournament } from "../lib/database";
import { getTournamentGames } from "../lib/database";
import {
  TournamentWinnerCalculator,
  TournamentWinner,
} from "../components/TournamentWinnerCalculator";
import { computePairsWithStats, computeTeamStandings, getTeamConfigFromStorage } from "../lib/standingsUtils";

export const useWinnerCalculation = () => {
  const [tournamentWinner, setTournamentWinner] =
    useState<TournamentWinner | null>(null);
  const [winningTeamName, setWinningTeamName] = useState<string | null>(null);
  const [showWinnerScreen, setShowWinnerScreen] = useState(false);

  const calculateAndShowWinner = async (
    pairs: Pair[],
    matches: Match[],
    setCurrentView: (view: "main" | "winner" | "public") => void,
    options?: { tournament?: Tournament | null }
  ) => {
    try {
      const tournament = options?.tournament;
      const teamConfig =
        tournament?.format === "teams" && tournament?.team_config?.teamNames?.length && tournament?.team_config?.pairToTeam
          ? tournament.team_config
          : tournament?.id
            ? getTeamConfigFromStorage(tournament.id)
            : null;
      const isTeams = !!teamConfig;

      if (isTeams && teamConfig) {
        console.log("🏆 Calculando equipo ganador...");
        setTournamentWinner(null);
        const games = await getTournamentGames(tournament!.id);
        const pairsWithStats = computePairsWithStats(pairs, matches, games || []);
        const teamStandings = computeTeamStandings(pairsWithStats, teamConfig);
        const teamName = teamStandings?.[0]?.name ?? null;
        setWinningTeamName(teamName);
        setShowWinnerScreen(true);
        setCurrentView("winner");
        console.log("✅ Equipo ganador:", teamName);
        return;
      }

      console.log("🏆 Calculando ganador de la reta (pareja)...");
      setWinningTeamName(null);
      const winner = await TournamentWinnerCalculator.calculateTournamentWinner(
        pairs,
        matches
      );
      setTournamentWinner(winner);
      setShowWinnerScreen(true);
      setCurrentView("winner");
      console.log("✅ Ganador calculado y pantalla mostrada");
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
    setCurrentView("main");
  };

  return {
    tournamentWinner,
    winningTeamName,
    showWinnerScreen,
    calculateAndShowWinner,
    hideWinnerScreen,
  };
};
