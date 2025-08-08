import React from "react";
import { Player } from "../lib/database";

interface CompactPlayerGridProps {
  players: Player[];
  onPlayerSelect?: (player: Player) => void;
  onDeletePlayer?: (id: string) => void;
  selectedPlayers?: Player[];
  playersInPairs?: string[];
}

export const CompactPlayerGrid: React.FC<CompactPlayerGridProps> = ({
  players,
  onPlayerSelect,
  onDeletePlayer,
  selectedPlayers = [],
  playersInPairs = [],
}) => {
  const isPlayerSelected = (player: Player) => {
    return selectedPlayers.some((p) => p.id === player.id);
  };

  const isPlayerInPair = (player: Player) => {
    return playersInPairs.includes(player.id);
  };

  return (
    <div className="compact-players-container">
      <div className="compact-players-header">
        <h4>👥 Jugadores Registrados ({players.length})</h4>
      </div>

      <div className="compact-players-grid">
        {players.map((player) => (
          <div
            key={player.id}
            className={`compact-player-card ${
              isPlayerSelected(player) ? "selected" : ""
            } ${isPlayerInPair(player) ? "in-pair" : ""}`}
            onClick={() => onPlayerSelect?.(player)}
          >
            <div className="compact-player-avatar">
              {player.name.charAt(0).toUpperCase()}
            </div>

            <div className="compact-player-info">
              <div className="compact-player-name">{player.name}</div>
              <div className="compact-player-date">
                {new Date(player.created_at).toLocaleDateString("es-ES")}
              </div>
            </div>

            <div className="compact-player-actions">
              <button
                className={`compact-select-btn ${
                  isPlayerSelected(player) ? "selected" : ""
                } ${isPlayerInPair(player) ? "disabled" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onPlayerSelect?.(player);
                }}
                disabled={isPlayerInPair(player)}
                title={
                  isPlayerInPair(player)
                    ? "Jugador ya está en una pareja"
                    : isPlayerSelected(player)
                    ? "Deseleccionar"
                    : "Seleccionar"
                }
              >
                {isPlayerSelected(player) ? "✓" : "○"}
              </button>

              <button
                className="compact-delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeletePlayer?.(player.id);
                }}
                title="Eliminar jugador"
              >
                🗑️
              </button>
            </div>

            {isPlayerInPair(player) && (
              <div className="compact-pair-indicator">🚫</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
