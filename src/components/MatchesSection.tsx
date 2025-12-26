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
    <div className="matches-container-simplified">
      {/* Header simplificado */}
      <div className="matches-header-simplified">
        <h3>🎾 Partidos</h3>
        <span className="matches-count-simplified">{matches.length} total</span>
      </div>
      
      {/* Lista de partidos */}
        {matches.length === 0 ? (
        <div className="matches-error-simplified">
            <p>📝 No hay partidos programados aún</p>
            <p>Inicia la reta para generar los partidos automáticamente</p>
          </div>
        ) : (
          Object.entries(matchesByRound).map(([round, roundMatches]) => (
          <div key={round} className="round-section-simplified">
            <div className="round-header-simplified">
              <h4>🔄 Ronda {round}</h4>
              <span>{roundMatches.length} partidos</span>
              </div>
            <div className="matches-grid-simplified">
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

      {/* Tabla de clasificación */}
      <RealTimeStandingsTable
        tournamentId={tournament.id}
        forceRefresh={forceRefresh}
      />

      {/* Botón para mostrar ganador */}
      {(isTournamentFinished || tournament.is_finished) && winner && (
        <div className="winner-button-container">
          <button className="show-winner-button" onClick={onShowWinnerScreen}>
            🏆 Ver Ganadores de la Reta
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
