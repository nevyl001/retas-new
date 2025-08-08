import React, { useState, useEffect } from "react";
import { Player, Pair } from "../lib/database";

interface PairManagerProps {
  pairs: Pair[];
  onPairUpdate: (pairId: string, player1: Player, player2: Player) => void;
  onPairDelete: (pairId: string) => void;
}

export const PairManager: React.FC<PairManagerProps> = ({
  pairs,
  onPairUpdate,
  onPairDelete,
}) => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [editingPair, setEditingPair] = useState<string | null>(null);
  const [selectedPlayer1, setSelectedPlayer1] = useState<Player | null>(null);
  const [selectedPlayer2, setSelectedPlayer2] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    loadPlayers();
  }, []);

  const loadPlayers = async () => {
    try {
      setLoading(true);
      const { getPlayers } = await import("../lib/database");
      const data = await getPlayers();
      setPlayers(data);
    } catch (err) {
      setError("Error al cargar los jugadores");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (pair: Pair) => {
    setEditingPair(pair.id);
    setSelectedPlayer1(pair.player1 || null);
    setSelectedPlayer2(pair.player2 || null);
    setError("");
  };

  const cancelEditing = () => {
    setEditingPair(null);
    setSelectedPlayer1(null);
    setSelectedPlayer2(null);
    setError("");
  };

  const handlePlayer1Select = (player: Player) => {
    // Verificar si el jugador ya está en otra pareja
    const isInOtherPair = pairs.some(
      (pair) =>
        pair.id !== editingPair &&
        (pair.player1_id === player.id || pair.player2_id === player.id)
    );

    if (isInOtherPair) {
      setError(`${player.name} ya está en otra pareja`);
      return;
    }

    // Verificar si es el mismo jugador que player2
    if (selectedPlayer2 && player.id === selectedPlayer2.id) {
      setError("No puedes seleccionar el mismo jugador para ambos");
      return;
    }

    setSelectedPlayer1(player);
    setError("");
  };

  const handlePlayer2Select = (player: Player) => {
    // Verificar si el jugador ya está en otra pareja
    const isInOtherPair = pairs.some(
      (pair) =>
        pair.id !== editingPair &&
        (pair.player1_id === player.id || pair.player2_id === player.id)
    );

    if (isInOtherPair) {
      setError(`${player.name} ya está en otra pareja`);
      return;
    }

    // Verificar si es el mismo jugador que player1
    if (selectedPlayer1 && player.id === selectedPlayer1.id) {
      setError("No puedes seleccionar el mismo jugador para ambos");
      return;
    }

    setSelectedPlayer2(player);
    setError("");
  };

  const handleSave = () => {
    if (!editingPair || !selectedPlayer1 || !selectedPlayer2) {
      setError("Debes seleccionar dos jugadores diferentes");
      return;
    }

    if (selectedPlayer1.id === selectedPlayer2.id) {
      setError("No puedes seleccionar el mismo jugador para ambos");
      return;
    }

    onPairUpdate(editingPair, selectedPlayer1, selectedPlayer2);
    cancelEditing();
  };

  const getAvailablePlayers = (excludePlayer?: Player | null) => {
    return players.filter((player) => {
      // Excluir el jugador que se está editando
      if (excludePlayer && player.id === excludePlayer.id) {
        return false;
      }

      // Verificar si está en otra pareja
      const isInOtherPair = pairs.some(
        (pair) =>
          pair.id !== editingPair &&
          (pair.player1_id === player.id || pair.player2_id === player.id)
      );

      return !isInOtherPair;
    });
  };

  const isPlayerSelected = (player: Player, isPlayer1: boolean) => {
    const selectedPlayer = isPlayer1 ? selectedPlayer1 : selectedPlayer2;
    return selectedPlayer?.id === player.id;
  };

  if (loading) {
    return <div className="loading">Cargando jugadores...</div>;
  }

  return (
    <div className="pair-manager-component">
      <div className="pair-manager-component-header">
        <h3>✏️ Gestión de Parejas</h3>
        <p>Edita las parejas existentes o elimínalas</p>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="pair-manager-pairs-list">
        {pairs.length === 0 ? (
          <div className="pair-manager-no-pairs">
            <p>No hay parejas registradas</p>
          </div>
        ) : (
          pairs.map((pair) => (
            <div key={pair.id} className="pair-manager-item">
              {editingPair === pair.id ? (
                <div className="pair-editing">
                  <div className="editing-header">
                    <h4>Editando Pareja</h4>
                    <div className="editing-actions">
                      <button
                        className="save-btn"
                        onClick={handleSave}
                        disabled={!selectedPlayer1 || !selectedPlayer2}
                      >
                        💾 Guardar
                      </button>
                      <button className="cancel-btn" onClick={cancelEditing}>
                        ❌ Cancelar
                      </button>
                    </div>
                  </div>

                  <div className="player-selection">
                    <div className="player-selector">
                      <h5>Jugador 1:</h5>
                      <div className="players-grid">
                        {getAvailablePlayers(selectedPlayer2).map((player) => (
                          <button
                            key={player.id}
                            className={`player-option ${
                              isPlayerSelected(player, true) ? "selected" : ""
                            }`}
                            onClick={() => handlePlayer1Select(player)}
                          >
                            {player.name}
                          </button>
                        ))}
                      </div>
                      {selectedPlayer1 && (
                        <div className="selected-player">
                          ✅ {selectedPlayer1.name}
                        </div>
                      )}
                    </div>

                    <div className="player-selector">
                      <h5>Jugador 2:</h5>
                      <div className="players-grid">
                        {getAvailablePlayers(selectedPlayer1).map((player) => (
                          <button
                            key={player.id}
                            className={`player-option ${
                              isPlayerSelected(player, false) ? "selected" : ""
                            }`}
                            onClick={() => handlePlayer2Select(player)}
                          >
                            {player.name}
                          </button>
                        ))}
                      </div>
                      {selectedPlayer2 && (
                        <div className="selected-player">
                          ✅ {selectedPlayer2.name}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="pair-manager-display">
                  <div className="pair-manager-info">
                    <div className="pair-manager-players">
                      <span className="pair-manager-player-name">
                        {pair.player1?.name || "Jugador 1"}
                      </span>
                      <span className="pair-manager-vs">&</span>
                      <span className="pair-manager-player-name">
                        {pair.player2?.name || "Jugador 2"}
                      </span>
                    </div>
                  </div>
                  <div className="pair-manager-actions">
                    <button
                      className="pair-manager-edit-btn"
                      onClick={() => startEditing(pair)}
                    >
                      ✏️ Editar
                    </button>
                    <button
                      className="pair-manager-delete-btn"
                      onClick={() => onPairDelete(pair.id)}
                    >
                      🗑️ Eliminar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
