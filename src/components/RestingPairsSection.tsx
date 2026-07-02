import React from "react";
import { Pair, Match } from "../lib/database";
import { pairPlayersDisplayLabel } from "../lib/pairPlayerNames";
import "./RestingPairsSection.css";

interface RestingPairsSectionProps {
  pairs: Pair[];
  matches: Match[];
  round: number;
  courts: number;
}

/** Partidos de la ronda: si ya vienen filtrados (p. ej. remontada), no re-filtrar por número. */
function resolveRoundMatches(matches: Match[], round: number): Match[] {
  if (!matches.length) return [];
  const roundNums = new Set(matches.map((m) => m.round ?? round));
  if (roundNums.size === 1) return matches;
  return matches.filter((m) => (m.round ?? round) === round);
}

/**
 * Calcula qué parejas descansan en una ronda específica.
 * Una pareja descansa si no está en ningún partido de esa ronda.
 */
const getRestingPairs = (
  pairs: Pair[],
  matches: Match[],
  round: number
): Pair[] => {
  const roundMatches = resolveRoundMatches(matches, round);
  const playingPairIds = new Set<string>();
  
  roundMatches.forEach((match) => {
    playingPairIds.add(match.pair1_id);
    playingPairIds.add(match.pair2_id);
  });

  // Las parejas que descansan son las que NO están jugando
  return pairs.filter((pair) => !playingPairIds.has(pair.id));
};

export const RestingPairsSection: React.FC<RestingPairsSectionProps> = ({
  pairs,
  matches,
  round,
  courts,
}) => {
  const restingPairs = getRestingPairs(pairs, matches, round);

  // Si todas las parejas están jugando, no mostrar nada
  if (restingPairs.length === 0) {
    return null;
  }

  // Calcular cuántas parejas deberían jugar vs cuántas descansan
  const pairsPlaying = pairs.length - restingPairs.length;
  const maxPairsThatCanPlay = courts * 2; // Cada cancha = 2 parejas por partido

  return (
    <div className="resting-pairs-section">
      <div className="resting-pairs-header">
        <span className="resting-pairs-icon">😴</span>
        <span className="resting-pairs-title">
          Parejas que Descansan ({restingPairs.length})
        </span>
      </div>
      <div className="resting-pairs-list">
        {restingPairs.map((pair) => (
          <div key={pair.id} className="resting-pair-card">
            <span className="resting-pair-name">
              {pairPlayersDisplayLabel(pair)}
            </span>
          </div>
        ))}
      </div>
      {restingPairs.length > 0 && (
        <div className="resting-pairs-info">
          <span className="resting-pairs-info-text">
            {pairsPlaying} parejas jugando ({courts} canchas × 2 parejas = {maxPairsThatCanPlay} máximo)
          </span>
        </div>
      )}
    </div>
  );
};

export default RestingPairsSection;
