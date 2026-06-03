import React, { useState, useEffect, useCallback } from "react";
import {
  createPlayer,
  getPlayers,
  deletePlayer,
  updatePlayer,
  Player,
} from "../lib/database";
import { JugadorAutocomplete } from "./jugadores/JugadorAutocomplete";
import "./jugadores/riviera-jugadores.css";

interface ModernPlayerManagerProps {
  onPlayerSelect?: (players: Player[]) => void;
  selectedPlayers?: Player[];
  allowMultipleSelection?: boolean;
  playersInPairs?: string[]; // IDs de jugadores que ya están en parejas
  userId?: string;
  tournamentId?: string;
}

export const ModernPlayerManager: React.FC<ModernPlayerManagerProps> = ({
  onPlayerSelect,
  selectedPlayers = [],
  allowMultipleSelection = false,
  playersInPairs = [],
  userId,
  tournamentId,
}) => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setError] = useState<string>("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [hoveredPlayer, setHoveredPlayer] = useState<string | null>(null);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const loadPlayers = useCallback(async () => {
    if (!userId) return;

    try {
      setLoading(true);
      const data = await getPlayers(userId, tournamentId);
      setPlayers(data);
    } catch (err) {
      setError("Error al cargar los jugadores");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [userId, tournamentId]);

  useEffect(() => {
    if (userId) {
      loadPlayers();
    }
  }, [userId, loadPlayers]);

  const handleCreatePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim() || !userId) return;

    try {
      setError("");
      const player = await createPlayer(newPlayerName.trim(), userId, tournamentId);
      setPlayers([...players, player]);
      setNewPlayerName("");
      setShowCreateForm(false);
    } catch (err) {
      setError("Error al crear el jugador");
      console.error(err);
    }
  };

  const handleUpdatePlayer = async (id: string) => {
    const name = editingName.trim();
    if (!name || name === players.find((p) => p.id === id)?.name) {
      setEditingPlayerId(null);
      setEditingName("");
      return;
    }
    try {
      setError("");
      const updated = await updatePlayer(id, name);
      setPlayers(players.map((p) => (p.id === id ? updated : p)));
      setEditingPlayerId(null);
      setEditingName("");
    } catch (err) {
      setError("Error al actualizar el nombre");
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
            {userId && (
              <JugadorAutocomplete
                organizadorId={userId}
                value={newPlayerName}
                onChange={setNewPlayerName}
                onSelect={(rj) => {
                  if (rj.legacy_player_id) {
                    const pl = players.find((p) => p.id === rj.legacy_player_id);
                    if (pl) {
                      handlePlayerSelect(pl);
                      setShowCreateForm(false);
                      setNewPlayerName("");
                      return;
                    }
                  }
                  setNewPlayerName(rj.nombre);
                }}
                placeholder="Buscar en registro Riviera…"
              />
            )}
            <div className="elegant-input-group">
              <input
                type="text"
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                placeholder="Nombre del jugador"
                required
                autoFocus={!userId}
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
                    {(editingPlayerId === player.id ? editingName : player.name).charAt(0).toUpperCase() || "?"}
                  </div>
                  <div className="elegant-player-info">
                    {editingPlayerId === player.id ? (
                      <div className="elegant-player-edit-row" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleUpdatePlayer(player.id);
                            if (e.key === "Escape") {
                              setEditingPlayerId(null);
                              setEditingName("");
                            }
                          }}
                          className="elegant-player-edit-input"
                          autoFocus
                          placeholder="Nombre"
                        />
                        <button
                          type="button"
                          onClick={() => handleUpdatePlayer(player.id)}
                          className="elegant-edit-save-btn"
                          title="Guardar"
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPlayerId(null);
                            setEditingName("");
                          }}
                          className="elegant-edit-cancel-btn"
                          title="Cancelar"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="elegant-player-name">{player.name}</span>
                        {isInPair && (
                          <span className="elegant-pair-indicator">
                            <span className="elegant-indicator-dot"></span>
                            En pareja
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {/* Acciones (lapicero + eliminar) agrupadas y centradas verticalmente */}
                  {editingPlayerId !== player.id && (
                    <div className="elegant-player-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          setEditingPlayerId(player.id);
                          setEditingName(player.name);
                        }}
                        className="elegant-edit-btn"
                        title="Editar nombre"
                      >
                        <span className="elegant-edit-icon">✎</span>
                      </button>
                      <button
                        onClick={() => handleDeletePlayer(player.id)}
                        className="elegant-delete-btn"
                        title="Eliminar jugador"
                      >
                        <span className="elegant-delete-icon">×</span>
                      </button>
                    </div>
                  )}
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
