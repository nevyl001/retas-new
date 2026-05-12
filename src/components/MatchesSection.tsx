import React, { useMemo } from "react";
import { Tournament, Match, Pair } from "../lib/database";
import MatchCardWithResults from "./MatchCardWithResults";
import RealTimeStandingsTable from "./RealTimeStandingsTable";
import RestingPairsSection from "./RestingPairsSection";

const TEAM_CONFIG_KEY = "rivieraapp_teams_";

function getTeamConfig(tournamentId: string): { teamNames: string[]; pairToTeam: Record<string, number> } | null {
  try {
    const raw = localStorage.getItem(`${TEAM_CONFIG_KEY}${tournamentId}`);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.teamNames?.length && data?.pairToTeam && typeof data.pairToTeam === "object") return data;
    return null;
  } catch {
    return null;
  }
}

interface MatchesSectionProps {
  tournament: Tournament;
  matches: Match[];
  pairs: Pair[]; // Agregado: pasar pairs para evitar cargas redundantes
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
  pairs, // Agregado
  matchesByRound,
  forceRefresh,
  setForceRefresh,
  isTournamentFinished,
  winner,
  onShowWinnerScreen,
  onBackToHome,
  userId,
}) => {
  const teamConfig = useMemo(() => {
    if (tournament.format === "teams" && tournament.team_config?.teamNames?.length && tournament.team_config?.pairToTeam) {
      return tournament.team_config;
    }
    return getTeamConfig(tournament.id);
  }, [tournament.id, tournament.format, tournament.team_config]);

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
                    pairs={pairs}
                    maxCourts={Math.max(1, tournament.courts || 1)}
                    isSelected={false}
                    onSelect={() => {}}
                    onCorrectScore={async (match: any) => {
                      console.log(
                        "🔄 Actualizando tabla para partido:",
                        match.id
                      );
                      try {
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
              
              {/* Sección de parejas que descansan en esta ronda */}
              <RestingPairsSection
                pairs={pairs}
                matches={matches}
                round={parseInt(round)}
                courts={tournament.courts}
              />
            </div>
          ))
        )}

      {/* Tabla de clasificación (y por equipos si aplica) */}
      <RealTimeStandingsTable
        tournamentId={tournament.id}
        forceRefresh={forceRefresh}
        teamConfig={teamConfig}
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
