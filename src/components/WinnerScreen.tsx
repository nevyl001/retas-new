import React from "react";
import { Pair } from "../lib/database";
import { TournamentWinner } from "./TournamentWinnerCalculator";
import "./WinnerHero.css";

interface WinnerScreenProps {
  isVisible: boolean;
  winner: Pair | null;
  tournamentWinner: TournamentWinner | null;
  /** Cuando el torneo es por equipos: nombre del equipo ganador (más puntos). */
  winningTeamName?: string | null;
  /** Estadísticas del equipo ganador (puntos, sets, partidos). */
  winningTeamStats?: { points: number; setsWon: number; matchesPlayed: number } | null;
  onBackToManager: () => void;
}

export const WinnerScreen: React.FC<WinnerScreenProps> = ({
  isVisible,
  winner,
  tournamentWinner,
  winningTeamName,
  winningTeamStats,
  onBackToManager,
}) => {
  if (!isVisible) return null;
  if (!winningTeamName && !winner) return null;

  if (winningTeamName) {
    return (
      <div className="winner-page">
        <div className="elegant-winner-screen">
          <div className="elegant-winner-section">
            <div className="winner-hero">
              <span className="winner-hero__trophy" aria-hidden="true">
                🏆
              </span>
              <p className="winner-hero__label">GANADORES</p>
              <div className="winner-hero__name-card">
                <div className="winner-hero__names">{winningTeamName}</div>
              </div>
              <p className="winner-hero__sub">
                Equipo ganador por puntos
              </p>
            </div>
            {winningTeamStats && (
              <div className="elegant-winner-stats">
                <div className="elegant-winner-stat">
                  <span className="elegant-winner-stat-number">{winningTeamStats.points}</span>
                  <span className="elegant-winner-stat-label">Puntos Totales</span>
                </div>
                <div className="elegant-winner-stat">
                  <span className="elegant-winner-stat-number">{winningTeamStats.setsWon}</span>
                  <span className="elegant-winner-stat-label">Sets</span>
                </div>
                <div className="elegant-winner-stat">
                  <span className="elegant-winner-stat-number">{winningTeamStats.matchesPlayed}</span>
                  <span className="elegant-winner-stat-label">Partidos Jugados</span>
                </div>
              </div>
            )}
            <div className="elegant-winner-actions">
              <button
                className="elegant-winner-back-btn"
                onClick={onBackToManager}
              >
                🏠 Volver al Gestor
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="winner-page">
      <div className="elegant-winner-screen">
        <div className="elegant-winner-section">
          <div className="winner-hero">
            <span className="winner-hero__trophy" aria-hidden="true">
              🏆
            </span>
            <p className="winner-hero__label">GANADORES</p>
            <div className="winner-hero__name-card">
              <div className="winner-hero__names">
                {winner!.player1?.name} / {winner!.player2?.name}
              </div>
            </div>
          </div>

          <div className="elegant-winner-stats">
            <div className="elegant-winner-stat">
              <span className="elegant-winner-stat-number">
                {tournamentWinner ? tournamentWinner.totalSets : 0}
              </span>
              <span className="elegant-winner-stat-label">Sets Ganados</span>
            </div>
            <div className="elegant-winner-stat">
              <span className="elegant-winner-stat-number">
                {tournamentWinner ? tournamentWinner.matchesPlayed : 0}
              </span>
              <span className="elegant-winner-stat-label">
                Partidos Jugados
              </span>
            </div>
            <div className="elegant-winner-stat">
              <span className="elegant-winner-stat-number">
                {tournamentWinner ? tournamentWinner.totalPoints : 0}
              </span>
              <span className="elegant-winner-stat-label">
                Puntos Totales
              </span>
            </div>
            {tournamentWinner && (
              <div className="elegant-winner-stat">
                <span className="elegant-winner-stat-number">
                  {tournamentWinner.winPercentage.toFixed(1)}%
                </span>
                <span className="elegant-winner-stat-label">
                  Porcentaje de Victoria
                </span>
              </div>
            )}
          </div>

          <div className="elegant-winner-actions">
            <button
              className="elegant-winner-back-btn"
              onClick={onBackToManager}
            >
              🏠 Volver al Gestor
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WinnerScreen;
