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
      <div className="elegant-pair-manager">
        <div className="elegant-loading">
          <div className="elegant-loading-spinner"></div>
          <p>Cargando parejas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="elegant-pair-manager">
      {/* Header Elegante */}
      <div className="elegant-pair-header">
        <div className="elegant-header-content">
          <div className="elegant-header-title">
            <div className="elegant-pair-count">{pairs.length} parejas</div>
          </div>
        </div>
      </div>

      {/* Mensaje de Error */}
      {error && (
        <div className="elegant-error">
          <span className="elegant-error-icon">⚠️</span>
          <span className="elegant-error-text">{error}</span>
        </div>
      )}

      {/* Grid de Parejas Elegante */}
      {pairs.length === 0 ? (
        <div className="elegant-empty-state">
          <h4>No hay parejas registradas</h4>
          <p>Crea parejas para comenzar el torneo</p>
        </div>
      ) : (
        <div className="elegant-pairs-grid">
          {pairs.map((pair, index) => {
            const isHovered = hoveredPair === pair.id;

            return (
              <div
                key={pair.id}
                className={`elegant-pair-card ${isHovered ? "hovered" : ""}`}
                onMouseEnter={() => setHoveredPair(pair.id)}
                onMouseLeave={() => setHoveredPair(null)}
              >
                {/* Efecto de fondo animado */}
                <div className="elegant-card-background"></div>

                {/* Contenido de la pareja */}
                <div className="elegant-pair-content">
                  {/* Nombres de jugadores */}
                  <div className="elegant-pair-names">
                    <h4>
                      {pair.player1?.name || "Jugador 1"} /{" "}
                      {pair.player2?.name || "Jugador 2"}
                    </h4>
                  </div>

                  {/* Botón de eliminar elegante */}
                  <button
                    className="elegant-delete-btn"
                    onClick={() => onPairDelete(pair.id)}
                    title="Eliminar pareja"
                  >
                    <span className="elegant-delete-icon">🗑️</span>
                  </button>
                </div>

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
