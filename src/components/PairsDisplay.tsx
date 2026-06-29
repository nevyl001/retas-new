import React from "react";
import { Pair } from "../lib/database";
import { TeamBadge } from "./teams/TeamBadge";
import {
  getPairTeamIndex,
  getPairTeamName,
  type TeamConfigLike,
} from "../lib/teamConfigDisplay";

interface PairsDisplayProps {
  pairs: Pair[];
  pairStats: Map<string, { sets: number; matches: number; points: number }>;
  teamConfig?: TeamConfigLike | null;
}

export const PairsDisplay: React.FC<PairsDisplayProps> = ({
  pairs,
  pairStats,
  teamConfig = null,
}) => {
  if (pairs.length === 0) return null;

  return (
    <div className="compact-pairs-manager">
      {/* Header Compacto */}
      <div className="compact-header">
        <div className="compact-header-content">
          <div className="compact-title">
            <span className="compact-icon">👥</span>
            <h3>Parejas registradas ({pairs.length})</h3>
          </div>
        </div>
      </div>

      {/* Grid de Parejas Compacto */}
      <div className="compact-pairs-grid">
        {pairs.map((pair, index) => {
          const teamName = getPairTeamName(pair.id, teamConfig);
          const teamIndex = getPairTeamIndex(pair.id, teamConfig);

          return (
          <div
            key={pair.id}
            className="compact-pair-card"
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            {/* Número de Pareja */}
            <div className="compact-pair-number">#{index + 1}</div>

            {/* Información de la Pareja */}
            <div className="compact-pair-info">
              {teamName ? (
                <TeamBadge
                  name={teamName}
                  teamIndex={teamIndex ?? undefined}
                  className="compact-pair-team"
                />
              ) : null}
              <div className="compact-pair-names">
                {pair.player1?.name || "Jugador 1"} /{" "}
                {pair.player2?.name || "Jugador 2"}
              </div>

              {/* Estadísticas Compactas */}
              <div className="compact-stats">
                <div className="compact-stat">
                  <span className="compact-stat-label">VIC</span>
                  <span className="compact-stat-value">
                    {pairStats.get(pair.id)?.sets || 0}
                  </span>
                </div>
                <div className="compact-stat">
                  <span className="compact-stat-label">PJ</span>
                  <span className="compact-stat-value">
                    {pairStats.get(pair.id)?.matches || 0}
                  </span>
                </div>
                <div className="compact-stat">
                  <span className="compact-stat-label">PTS</span>
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
        );
        })}
      </div>
    </div>
  );
};

export default PairsDisplay;
