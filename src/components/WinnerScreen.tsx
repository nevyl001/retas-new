import React, { useEffect, useMemo, useState } from "react";
import { Pair } from "../lib/database";
import { TournamentWinner } from "../lib/tournamentWinner";
import {
  resolvePlayerAvatars,
  type PlayerAvatarLookupEntry,
} from "../lib/rivieraJugadores/publicPlayerAvatars";
import { RetaRoundRobinWinnerCelebrate } from "./reta/RetaRoundRobinWinnerCelebrate";
import { PublicRetaWinnerSection } from "./public/PublicRetaWinnerSection";
import type { PublicRetaWinnerAvatar } from "./public/PublicRetaWinnerSection";
import {
  buildTeamWinnerCelebrateStatCards,
  type TeamWinnerCelebrateStats,
} from "../lib/teamWinnerCelebrate";
import "./WinnerHero.css";

interface WinnerScreenProps {
  isVisible: boolean;
  winner: Pair | null;
  tournamentWinner: TournamentWinner | null;
  winningTeamName?: string | null;
  winningTeamStats?: TeamWinnerCelebrateStats | null;
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

  const teamCelebrateStats = useMemo(() => {
    if (!winningTeamStats) return undefined;
    return buildTeamWinnerCelebrateStatCards(winningTeamStats);
  }, [winningTeamStats]);

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
      <div className="winner-page winner-page--team-share">
        <PublicRetaWinnerSection
          title={winningTeamName}
          subtitle="Equipo ganador por games acumulados"
          torneoNombre={torneoNombre}
          formatKicker="Dual meet"
          stats={teamCelebrateStats}
          shareable
        />
        <div className="elegant-winner-actions elegant-winner-actions--overlay">
          <button
            className="elegant-winner-back-btn"
            onClick={onBackToManager}
          >
            🏠 Volver al Gestor
          </button>
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
