import React from "react";
import { Tournament, Pair } from "../lib/database";

interface StartTournamentSectionProps {
  tournament: Tournament;
  pairs: Pair[];
  loading: boolean;
  onStartTournament: () => void;
}

export const StartTournamentSection: React.FC<StartTournamentSectionProps> = ({
  tournament,
  pairs,
  loading,
  onStartTournament,
}) => {
  if (tournament.is_started) return null;

  return (
    <div className="start-tournament-section">
      <h3>🚀 Iniciar Reta</h3>
      <div className="tournament-info">
        <p>Tienes {pairs.length} parejas registradas</p>
        <p>
          Se crearán {(pairs.length * (pairs.length - 1)) / 2} partidos
          (round-robin completo - todas las parejas se enfrentan)
        </p>
        <p>
          Estado de la reta: {tournament.is_started ? "Iniciada" : "Pendiente"}
        </p>
      </div>
      <button
        className="start-button"
        onClick={onStartTournament}
        disabled={loading || pairs.length < 2}
      >
        {loading
          ? "⏳ Iniciando..."
          : tournament.is_started
          ? "🏆 Reta Ya Iniciada"
          : pairs.length < 2
          ? "❌ Necesitas al menos 2 parejas"
          : "🚀 ¡Iniciar Reta!"}
      </button>
    </div>
  );
};

export default StartTournamentSection;
