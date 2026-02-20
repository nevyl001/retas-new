import { useState } from "react";
import { Pair, Match, Tournament } from "../lib/database";
import { getTournamentGames } from "../lib/database";
import {
  TournamentWinnerCalculator,
  TournamentWinner,
} from "../components/TournamentWinnerCalculator";
import { computePairsWithStats, computeTeamStandings, getTeamConfigFromStorage, inferTeamConfigFromPairs } from "../lib/standingsUtils";

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
      const storedTeamConfig =
        tournament?.format === "teams" && tournament?.team_config?.teamNames?.length && tournament?.team_config?.pairToTeam
          ? tournament.team_config
          : tournament?.id
            ? getTeamConfigFromStorage(tournament.id)
            : null;
      const teamConfig = storedTeamConfig ?? (pairs.length >= 2 ? inferTeamConfigFromPairs(pairs) : null);
      const isTeams = !!teamConfig;

      if (isTeams && teamConfig) {
        console.log("🏆 Calculando equipo ganador (más puntos)...");
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
        console.log("✅ Equipo ganador:", first?.name, "Puntos:", first?.points);
        return;
      }

      console.log("🏆 Calculando ganador de la reta (pareja)...");
      setWinningTeamName(null);
      setWinningTeamStats(null);
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
