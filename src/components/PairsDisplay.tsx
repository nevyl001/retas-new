import React from "react";
import { Pair } from "../lib/database";

interface PairsDisplayProps {
  pairs: Pair[];
  pairStats: Map<string, { sets: number; matches: number; points: number }>;
}

export const PairsDisplay: React.FC<PairsDisplayProps> = ({
  pairs,
  pairStats,
}) => {
  if (pairs.length === 0) return null;

  return (
    <div className="compact-pairs-manager">
      {/* Header Compacto */}
      <div className="compact-header">
        <div className="compact-header-content">
          <div className="compact-title">
            <span className="compact-icon">👥</span>
            <h3>Parejas Registradas ({pairs.length})</h3>
          </div>
        </div>
      </div>

      {/* Grid de Parejas Compacto */}
      <div className="compact-pairs-grid">
        {pairs.map((pair, index) => (
          <div
            key={pair.id}
            className="compact-pair-card"
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            {/* Número de Pareja */}
            <div className="compact-pair-number">#{index + 1}</div>

            {/* Información de la Pareja */}
            <div className="compact-pair-info">
              <div className="compact-pair-names">
                {pair.player1?.name || "Jugador 1"} /{" "}
                {pair.player2?.name || "Jugador 2"}
              </div>

              {/* Estadísticas Compactas */}
              <div className="compact-stats">
                <div className="compact-stat">
                  <span className="compact-stat-label">SETS</span>
                  <span className="compact-stat-value">
                    {pairStats.get(pair.id)?.sets || 0}
                  </span>
                </div>
                <div className="compact-stat">
                  <span className="compact-stat-label">PARTIDOS</span>
                  <span className="compact-stat-value">
                    {pairStats.get(pair.id)?.matches || 0}
                  </span>
                </div>
                <div className="compact-stat">
                  <span className="compact-stat-label">PUNTOS</span>
                  <span className="compact-stat-value">
                    {pairStats.get(pair.id)?.points || 0}
                  </span>
                </div>
              </div>
            </div>

            {/* Efectos de partículas */}
            <div className="compact-particles">
              <div className="compact-particle"></div>
              <div className="compact-particle"></div>
              <div className="compact-particle"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PairsDisplay;
