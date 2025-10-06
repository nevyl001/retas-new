import React from "react";
import { Tournament, Match, Pair } from "../lib/database";
import MatchCardWithResults from "./MatchCardWithResults";
import RealTimeStandingsTable from "./RealTimeStandingsTable";

interface MatchesSectionProps {
  tournament: Tournament;
  matches: Match[];
  matchesByRound: Record<number, Match[]>;
  forceRefresh: number;
  setForceRefresh: React.Dispatch<React.SetStateAction<number>>;
  isTournamentFinished: boolean;
  winner: Pair | null;
  onShowWinnerScreen: () => void;
  onBackToHome: () => void;
  userId?: string;
}

export const MatchesSection: React.FC<MatchesSectionProps> = ({
  tournament,
  matches,
  matchesByRound,
  forceRefresh,
  setForceRefresh,
  isTournamentFinished,
  winner,
  onShowWinnerScreen,
  onBackToHome,
  userId,
}) => {
  if (!tournament.is_started) return null;

  return (
    <div className="reta-content">
      {/* Lista de partidos */}
      <div className="modern-matches-section">
        <div className="modern-matches-header">
          <div className="modern-matches-title">
            <h3>🎾 Partidos</h3>
            <span className="modern-matches-count">{matches.length} total</span>
          </div>
        </div>
        {matches.length === 0 ? (
          <div className="modern-match-error">
            <p>📝 No hay partidos programados aún</p>
            <p>Inicia la reta para generar los partidos automáticamente</p>
          </div>
        ) : (
          Object.entries(matchesByRound).map(([round, roundMatches]) => (
            <div key={round} className="modern-round-section">
              <div className="modern-round-header">
                <h4 className="modern-round-title">🔄 Ronda {round}</h4>
                <span className="modern-round-count">
                  {roundMatches.length} partidos
                </span>
              </div>
              <div className="modern-matches-grid">
                {roundMatches.map((match) => (
                  <MatchCardWithResults
                    key={match.id}
                    match={match}
                    isSelected={false}
                    onSelect={() => {}}
                    onCorrectScore={async (match: any) => {
                      console.log(
                        "🔄 Actualizando tabla para partido:",
                        match.id
                      );
                      try {
                        // Solo incrementar forceRefresh - StandingsTable se actualizará automáticamente
                        setForceRefresh((prev) => prev + 1);
                        console.log("✅ ForceRefresh incrementado");
                      } catch (error) {
                        console.error("❌ Error en actualización:", error);
                      }
                    }}
                    forceRefresh={forceRefresh}
                    userId={userId}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Tabla de clasificación */}
      <RealTimeStandingsTable
        tournamentId={tournament.id}
        forceRefresh={forceRefresh}
      />

      {/* Botón para mostrar ganador */}
      {(isTournamentFinished || tournament.is_finished) && winner && (
        <div className="winner-button-container">
          <button className="show-winner-button" onClick={onShowWinnerScreen}>
            🏆 ¡Ver Ganador de la Reta!
          </button>
        </div>
      )}

      {/* Botón para volver al inicio */}
      <div className="back-home-button-container">
        <button className="back-home-button" onClick={onBackToHome}>
          🏠 Volver al Inicio
        </button>
      </div>
    </div>
  );
};

export default MatchesSection;
