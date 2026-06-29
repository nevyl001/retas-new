import React, { useEffect, useMemo, useState } from "react";
import { Pair } from "../lib/database";
import { TournamentWinner } from "../lib/tournamentWinner";
import {
  resolvePlayerAvatars,
  type PlayerAvatarLookupEntry,
} from "../lib/rivieraJugadores/publicPlayerAvatars";
import { RetaRoundRobinWinnerCelebrate } from "./reta/RetaRoundRobinWinnerCelebrate";
import type { PublicRetaWinnerAvatar } from "./public/PublicRetaWinnerSection";
import "./WinnerHero.css";

interface WinnerScreenProps {
  isVisible: boolean;
  winner: Pair | null;
  tournamentWinner: TournamentWinner | null;
  /** Cuando el torneo es por equipos: nombre del equipo ganador (más puntos). */
  winningTeamName?: string | null;
  /** Estadísticas del equipo ganador (puntos, sets, partidos). */
  winningTeamStats?: { points: number; setsWon: number; matchesPlayed: number } | null;
  userId?: string;
  torneoNombre?: string;
  onBackToManager: () => void;
}

export const WinnerScreen: React.FC<WinnerScreenProps> = ({
  isVisible,
  winner,
  tournamentWinner,
  winningTeamName,
  winningTeamStats,
  userId,
  torneoNombre,
  onBackToManager,
}) => {
  const [winnerAvatars, setWinnerAvatars] = useState<PublicRetaWinnerAvatar[]>(
    []
  );

  const winnerAvatarEntries = useMemo((): PlayerAvatarLookupEntry[] => {
    if (!winner) return [];
    return [
      { id: winner.player1_id, name: winner.player1_name },
      { id: winner.player2_id, name: winner.player2_name },
    ];
  }, [winner]);

  useEffect(() => {
    if (!isVisible || !userId || winnerAvatarEntries.length === 0) {
      setWinnerAvatars([]);
      return;
    }
    let cancelled = false;
    void resolvePlayerAvatars(userId, winnerAvatarEntries).then((map) => {
      if (cancelled) return;
      setWinnerAvatars(
        winnerAvatarEntries.map((e) => ({
          name: e.name,
          fotoUrl: map[e.id] ?? null,
          jugadorId: e.id,
        }))
      );
    });
    return () => {
      cancelled = true;
    };
  }, [isVisible, userId, winnerAvatarEntries]);

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
              <p className="winner-hero__sub">Equipo ganador por puntos</p>
            </div>
            {winningTeamStats && (
              <div className="elegant-winner-stats">
                <div className="elegant-winner-stat">
                  <span className="elegant-winner-stat-number">
                    {winningTeamStats.points}
                  </span>
                  <span className="elegant-winner-stat-label">Puntos Totales</span>
                </div>
                <div className="elegant-winner-stat">
                  <span className="elegant-winner-stat-number">
                    {winningTeamStats.setsWon}
                  </span>
                  <span className="elegant-winner-stat-label">Sets</span>
                </div>
                <div className="elegant-winner-stat">
                  <span className="elegant-winner-stat-number">
                    {winningTeamStats.matchesPlayed}
                  </span>
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
      <div className="elegant-winner-screen elegant-winner-screen--share">
        <RetaRoundRobinWinnerCelebrate
          pairLabel={`${winner!.player1_name} / ${winner!.player2_name}`}
          pairId={winner!.id}
          torneoNombre={torneoNombre}
          tournamentWinner={tournamentWinner}
          winners={winnerAvatars}
        />
        <div className="elegant-winner-actions">
          <button className="elegant-winner-back-btn" onClick={onBackToManager}>
            🏠 Volver al Gestor
          </button>
        </div>
      </div>
    </div>
  );
};

export default WinnerScreen;
