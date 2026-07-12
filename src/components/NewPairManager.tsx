import React, { useMemo, useState } from "react";
import { Player, Pair } from "../lib/database";
import {
  derivePlayerPoolViews,
  shouldShowPlayerPoolLoading,
} from "../hooks/organizerPlayerPoolLogic";

interface NewPairManagerProps {
  pairs: Pair[];
  onPairUpdate: (pairId: string, player1: Player, player2: Player) => void;
  onPairDelete: (pairId: string) => void;
  /** Pool compartido desde FourComponentsGrid (sin fetch propio) */
  players?: Player[];
  loading?: boolean;
}

export const NewPairManager: React.FC<NewPairManagerProps> = ({
  pairs,
  onPairDelete,
  players = [],
  loading = false,
}) => {
  const [hoveredPair, setHoveredPair] = useState<string | null>(null);

  const pairedIds = useMemo(
    () => pairs.flatMap((pair) => [pair.player1_id, pair.player2_id]),
    [pairs]
  );

  const { available, paired } = useMemo(
    () => derivePlayerPoolViews(players, pairedIds),
    [players, pairedIds]
  );

  // No bloquear la UI de parejas por el pool; solo hint de pool en primera carga.
  const showPoolHint = shouldShowPlayerPoolLoading(loading, players.length);

  return (
    <div className="elegant-pair-manager">
      <div className="elegant-pair-header">
        <div className="elegant-header-content">
          <div className="elegant-header-title">
            <div className="elegant-pair-count">{pairs.length} parejas</div>
            {!showPoolHint ? (
              <div className="elegant-pair-count" style={{ opacity: 0.85 }}>
                Disponibles: {available.length}
                {paired.length > 0 ? ` · Emparejados: ${paired.length}` : ""}
              </div>
            ) : (
              <div className="elegant-pair-count" style={{ opacity: 0.7 }}>
                Cargando pool…
              </div>
            )}
          </div>
        </div>
      </div>

      {pairs.length === 0 ? (
        <div className="elegant-empty-state">
          <h4>No hay parejas registradas</h4>
          <p>Crea parejas para comenzar la reta</p>
        </div>
      ) : (
        <div className="elegant-pairs-grid">
          {pairs.map((pair) => {
            const isHovered = hoveredPair === pair.id;

            return (
              <div
                key={pair.id}
                className={`elegant-pair-card ${isHovered ? "hovered" : ""}`}
                onMouseEnter={() => setHoveredPair(pair.id)}
                onMouseLeave={() => setHoveredPair(null)}
              >
                <div className="elegant-card-background"></div>

                <div className="elegant-pair-content">
                  <div className="elegant-pair-names">
                    <h4>
                      {pair.player1?.name || "Jugador 1"} /{" "}
                      {pair.player2?.name || "Jugador 2"}
                    </h4>
                  </div>

                  <button
                    className="elegant-delete-btn"
                    onClick={() => onPairDelete(pair.id)}
                    title="Eliminar pareja"
                  >
                    <span className="elegant-delete-icon">🗑️</span>
                  </button>
                </div>

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
