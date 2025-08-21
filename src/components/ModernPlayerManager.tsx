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
      <div className="modern-player-manager">
        <div className="modern-loading">
          <div className="loading-spinner"></div>
          <p>Cargando jugadores...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="modern-player-manager">
      {/* Header Moderno */}
      <div className="modern-player-header">
        <div className="header-content">
          <div className="header-title">
            <div className="title-icon">👥</div>
            <h3>Jugadores</h3>
            <div className="player-count">{players.length}</div>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="modern-add-btn"
          >
            <span className="btn-icon">{showCreateForm ? "✕" : "+"}</span>
            <span className="btn-text">
              {showCreateForm ? "Cancelar" : "Agregar"}
            </span>
          </button>
        </div>
      </div>

      {/* Formulario Moderno */}
      {showCreateForm && (
        <div className="modern-create-form">
          <div className="form-header">
            <h4>✨ Nuevo Jugador</h4>
            <p>Agrega un nuevo jugador a tu reta</p>
          </div>
          <form onSubmit={handleCreatePlayer} className="modern-form">
            <div className="modern-input-group">
              <input
                type="text"
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                placeholder="Nombre del jugador"
                required
                autoFocus
                className="modern-input"
              />
              <div className="input-border"></div>
            </div>
            <div className="form-actions">
              <button type="submit" className="modern-submit-btn">
                <span className="btn-icon">✓</span>
                <span>Agregar</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewPlayerName("");
                }}
                className="modern-cancel-btn"
              >
                <span className="btn-icon">✕</span>
                <span>Cancelar</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Mensaje de Error */}
      {error && (
        <div className="modern-error">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Grid de Jugadores */}
      {players.length === 0 ? (
        <div className="modern-empty-state">
          <div className="empty-icon">👥</div>
          <h4>No hay jugadores</h4>
          <p>Agrega jugadores para poder crear parejas</p>
        </div>
      ) : (
        <div className="modern-players-grid">
          {players.map((player) => {
            const isSelected = selectedPlayers.some((p) => p.id === player.id);
            const isInPair = playersInPairs.includes(player.id);
            const isHovered = hoveredPlayer === player.id;

            return (
              <div
                key={player.id}
                className={`modern-player-card ${
                  isSelected ? "selected" : ""
                } ${isInPair ? "in-pair" : ""} ${isHovered ? "hovered" : ""}`}
                onClick={() => handlePlayerSelect(player)}
                onMouseEnter={() => setHoveredPlayer(player.id)}
                onMouseLeave={() => setHoveredPlayer(null)}
              >
                {/* Efecto de fondo animado */}
                <div className="card-background"></div>

                {/* Contenido del jugador */}
                <div className="player-content">
                  <div className="player-avatar">
                    {player.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="player-info">
                    <span className="player-name">{player.name}</span>
                    {isInPair && (
                      <span className="pair-indicator">
                        <span className="indicator-dot"></span>
                        En pareja
                      </span>
                    )}
                  </div>

                  {/* Botón de eliminar */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePlayer(player.id);
                    }}
                    className="modern-delete-btn"
                    title="Eliminar jugador"
                  >
                    <span className="delete-icon">×</span>
                  </button>
                </div>

                {/* Indicador de selección */}
                {isSelected && (
                  <div className="selection-indicator">
                    <span className="check-icon">✓</span>
                  </div>
                )}

                {/* Efectos de partículas */}
                <div className="particles">
                  <div className="particle"></div>
                  <div className="particle"></div>
                  <div className="particle"></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
