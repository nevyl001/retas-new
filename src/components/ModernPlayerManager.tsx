import React, { useState, useEffect } from "react";
import {
  createPlayer,
  getPlayers,
  deletePlayer,
  Player,
} from "../lib/database";

interface ModernPlayerManagerProps {
  onPlayerSelect?: (players: Player[]) => void;
  selectedPlayers?: Player[];
  allowMultipleSelection?: boolean;
  playersInPairs?: string[]; // IDs de jugadores que ya están en parejas
}

export const ModernPlayerManager: React.FC<ModernPlayerManagerProps> = ({
  onPlayerSelect,
  selectedPlayers = [],
  allowMultipleSelection = false,
  playersInPairs = [],
}) => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [hoveredPlayer, setHoveredPlayer] = useState<string | null>(null);

  useEffect(() => {
    loadPlayers();
  }, []);

  const loadPlayers = async () => {
    try {
      setLoading(true);
      const data = await getPlayers();
      setPlayers(data);
    } catch (err) {
      setError("Error al cargar los jugadores");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim()) return;

    try {
      setError("");
      const player = await createPlayer(newPlayerName.trim());
      setPlayers([...players, player]);
      setNewPlayerName("");
      setShowCreateForm(false);
    } catch (err) {
      setError("Error al crear el jugador");
      console.error(err);
    }
  };

  const handleDeletePlayer = async (id: string) => {
    if (
      !window.confirm(
        "¿Estás seguro de que quieres eliminar este jugador? Esta acción no se puede deshacer."
      )
    ) {
      return;
    }

    try {
      setError("");
      await deletePlayer(id);
      setPlayers(players.filter((p) => p.id !== id));
    } catch (err) {
      setError("Error al eliminar el jugador");
      console.error(err);
    }
  };

  const handlePlayerSelect = (player: Player) => {
    // Verificar si el jugador ya está en una pareja
    if (playersInPairs.includes(player.id)) {
      console.log(`🚨 JUGADOR BLOQUEADO: ${player.name} ya está en una pareja`);
      alert(
        `No puedes seleccionar a ${player.name} porque ya está en una pareja. Debes eliminar su pareja actual primero.`
      );
      return;
    }

    if (onPlayerSelect) {
      if (allowMultipleSelection) {
        const isSelected = selectedPlayers.some((p) => p.id === player.id);
        if (isSelected) {
          // Deseleccionar el jugador si ya está seleccionado
          onPlayerSelect(selectedPlayers.filter((p) => p.id !== player.id));
        } else {
          onPlayerSelect([...selectedPlayers, player]);
        }
      } else {
        onPlayerSelect([player]);
      }
    }
  };

  if (loading) {
    return (
      <div className="elegant-player-manager">
        <div className="elegant-loading">
          <div className="elegant-loading-spinner"></div>
          <p>Cargando jugadores...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="elegant-player-manager">
      {/* Header Elegante */}
      <div className="elegant-player-header">
        <div className="elegant-header-content">
          <div className="elegant-header-title">
            <h3>Jugadores</h3>
            <div className="elegant-player-count">{players.length}</div>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="elegant-add-btn"
          >
            <span className="elegant-btn-icon">
              {showCreateForm ? "✕" : "+"}
            </span>
            <span className="elegant-btn-text">
              {showCreateForm ? "Cancelar" : "Agregar"}
            </span>
          </button>
        </div>
      </div>

      {/* Formulario Moderno */}
      {showCreateForm && (
        <div className="elegant-create-form">
          <div className="elegant-form-header">
            <h4>✨ Nuevo Jugador</h4>
            <p>Agrega un nuevo jugador a tu reta</p>
          </div>
          <form onSubmit={handleCreatePlayer} className="elegant-form">
            <div className="elegant-input-group">
              <input
                type="text"
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                placeholder="Nombre del jugador"
                required
                autoFocus
                className="elegant-input"
              />
              <div className="elegant-input-border"></div>
            </div>
            <div className="elegant-form-actions">
              <button type="submit" className="elegant-submit-btn">
                <span className="elegant-btn-icon">✓</span>
                <span>Agregar</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewPlayerName("");
                }}
                className="elegant-cancel-btn"
              >
                <span className="elegant-btn-icon">✕</span>
                <span>Cancelar</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Grid de Jugadores Elegante */}
      {players.length === 0 ? (
        <div className="elegant-empty-state">
          <h4>No hay jugadores</h4>
          <p>Agrega jugadores para poder crear parejas</p>
        </div>
      ) : (
        <div className="elegant-players-grid">
          {players.map((player) => {
            const isSelected = selectedPlayers.some((p) => p.id === player.id);
            const isInPair = playersInPairs.includes(player.id);
            const isHovered = hoveredPlayer === player.id;

            return (
              <div
                key={player.id}
                className={`elegant-player-card ${
                  isSelected ? "selected" : ""
                } ${isInPair ? "in-pair" : ""} ${isHovered ? "hovered" : ""}`}
                onClick={() => handlePlayerSelect(player)}
                onMouseEnter={() => setHoveredPlayer(player.id)}
                onMouseLeave={() => setHoveredPlayer(null)}
              >
                {/* Efecto de fondo animado */}
                <div className="elegant-card-background"></div>

                {/* Contenido del jugador */}
                <div className="elegant-player-content">
                  <div className="elegant-player-avatar">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="elegant-player-info">
                    <span className="elegant-player-name">{player.name}</span>
                    {isInPair && (
                      <span className="elegant-pair-indicator">
                        <span className="elegant-indicator-dot"></span>
                        En pareja
                      </span>
                    )}
                  </div>

                  {/* Botón de eliminar elegante */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePlayer(player.id);
                    }}
                    className="elegant-delete-btn"
                    title="Eliminar jugador"
                  >
                    <span className="elegant-delete-icon">×</span>
                  </button>
                </div>

                {/* Indicador de selección */}
                {isSelected && (
                  <div className="elegant-selection-indicator">
                    <span className="elegant-check-icon">✓</span>
                  </div>
                )}

                {/* Efectos de partículas */}
                <div className="elegant-particles">
                  <div className="elegant-particle"></div>
                  <div className="elegant-particle"></div>
                  <div className="elegant-particle"></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
