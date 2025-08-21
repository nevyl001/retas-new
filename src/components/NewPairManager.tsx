import React, { useState, useEffect } from "react";
import { Player, Pair } from "../lib/database";

interface NewPairManagerProps {
  pairs: Pair[];
  onPairUpdate: (pairId: string, player1: Player, player2: Player) => void;
  onPairDelete: (pairId: string) => void;
}

export const NewPairManager: React.FC<NewPairManagerProps> = ({
  pairs,
  onPairUpdate,
  onPairDelete,
}) => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [hoveredPair, setHoveredPair] = useState<string | null>(null);

  useEffect(() => {
    loadPlayers();
  }, []);

  const loadPlayers = async () => {
    try {
      setLoading(true);
      const allPlayers = await import("../lib/database").then(
        (module) => module.getPlayers
      );
      const playersData = await allPlayers();
      setPlayers(playersData);
    } catch (err) {
      console.error("Error loading players:", err);
      setError("Error al cargar jugadores: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="new-pair-manager">
        <div className="new-loading">
          <div className="new-loading-spinner"></div>
          <p>Cargando parejas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="new-pair-manager">
      {/* Header Nuevo */}
      <div className="new-pair-header">
        <div className="new-header-content">
          <div className="new-header-title">
            <div className="new-title-icon">🏓</div>
            <h3>Gestión de Parejas</h3>
            <div className="new-pair-count">{pairs.length}</div>
          </div>
        </div>
      </div>

      {/* Mensaje de Error */}
      {error && (
        <div className="new-error">
          <span className="new-error-icon">⚠️</span>
          <span className="new-error-text">{error}</span>
        </div>
      )}

      {/* Grid de Parejas */}
      {pairs.length === 0 ? (
        <div className="new-empty-state">
          <div className="new-empty-icon">🏓</div>
          <h4>No hay parejas registradas</h4>
          <p>Crea parejas para comenzar el torneo</p>
        </div>
      ) : (
        <div className="new-pairs-grid">
          {pairs.map((pair, index) => {
            const isHovered = hoveredPair === pair.id;

            return (
              <div
                key={pair.id}
                className={`new-pair-card ${isHovered ? "hovered" : ""}`}
                onMouseEnter={() => setHoveredPair(pair.id)}
                onMouseLeave={() => setHoveredPair(null)}
              >
                {/* Header de la tarjeta */}
                <div className="new-pair-header">
                  {/* Número de pareja */}
                  <div className="new-pair-number">#{index + 1}</div>

                  {/* Nombres de jugadores */}
                  <div className="new-pair-names">
                    <h4>
                      {pair.player1?.name || "Jugador 1"} /{" "}
                      {pair.player2?.name || "Jugador 2"}
                    </h4>
                  </div>

                  {/* Botón de eliminar */}
                  <button
                    className="new-delete-btn"
                    onClick={() => onPairDelete(pair.id)}
                    title="Eliminar pareja"
                  >
                    <span>🗑️</span>
                  </button>
                </div>

                {/* Sección de estadísticas */}
                <div className="new-pair-stats">
                  <div className="new-stat-card">
                    <div className="new-stat-label">SETS</div>
                    <div className="new-stat-value">0</div>
                  </div>
                  <div className="new-stat-card">
                    <div className="new-stat-label">PARTIDOS</div>
                    <div className="new-stat-value">0</div>
                  </div>
                  <div className="new-stat-card">
                    <div className="new-stat-label">PUNTOS</div>
                    <div className="new-stat-value">0</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
