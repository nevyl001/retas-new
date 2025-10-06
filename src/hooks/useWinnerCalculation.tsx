import { useState } from "react";
import { Pair, Match } from "../lib/database";
import {
  TournamentWinnerCalculator,
  TournamentWinner,
} from "../components/TournamentWinnerCalculator";

export const useWinnerCalculation = () => {
  const [tournamentWinner, setTournamentWinner] =
    useState<TournamentWinner | null>(null);
  const [showWinnerScreen, setShowWinnerScreen] = useState(false);

  const calculateAndShowWinner = async (
    pairs: Pair[],
    matches: Match[],
    setCurrentView: (view: "main" | "winner" | "public") => void
  ) => {
    try {
      console.log("🏆 Calculando ganador de la reta...");

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
    setCurrentView("main");
  };

  return {
    tournamentWinner,
    showWinnerScreen,
    calculateAndShowWinner,
    hideWinnerScreen,
  };
};
