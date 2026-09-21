import React from "react";
import { Pair, Match } from "../lib/database";
import { pairPlayersDisplayLabel } from "../lib/pairPlayerNames";
import {
  getPairTeamIndex,
  getPairTeamName,
  type TeamConfigLike,
} from "../lib/teamConfigDisplay";
import { TeamBadge } from "./teams/TeamBadge";
import { TablerIcon } from "./ui/TablerIcon";
import "./RestingPairsSection.css";

interface RestingPairsSectionProps {
  pairs: Pair[];
  matches: Match[];
  round: number;
  courts: number;
  teamConfig?: TeamConfigLike | null;
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

  return pairs.filter((pair) => !playingPairIds.has(pair.id));
};

export const RestingPairsSection: React.FC<RestingPairsSectionProps> = ({
  pairs,
  matches,
  round,
  courts,
  teamConfig = null,
}) => {
  const restingPairs = getRestingPairs(pairs, matches, round);

  if (restingPairs.length === 0) {
    return null;
  }

  const pairsPlaying = pairs.length - restingPairs.length;
  const maxPairsThatCanPlay = courts * 2;
  const showTeams = Boolean(
    teamConfig?.teamNames?.length &&
      teamConfig?.pairToTeam &&
      Object.keys(teamConfig.pairToTeam).length > 0
  );

  return (
    <div className="resting-pairs-section">
      <div className="resting-pairs-header">
        <span className="resting-pairs-icon">
          <TablerIcon name="moon" size={16} />
        </span>
        <span className="resting-pairs-title">
          Parejas que Descansan ({restingPairs.length})
        </span>
      </div>
      <div className="resting-pairs-list">
        {restingPairs.map((pair) => {
          const teamName = showTeams
            ? getPairTeamName(pair.id, teamConfig, pair)
            : null;
          const teamIndex = showTeams
            ? getPairTeamIndex(pair.id, teamConfig, pair)
            : null;

          return (
            <div
              key={pair.id}
              className={`resting-pair-card${
                showTeams ? " resting-pair-card--teams" : ""
              }`}
            >
              {teamName ? (
                <TeamBadge
                  name={teamName}
                  teamIndex={teamIndex ?? undefined}
                  className="resting-pair-team"
                />
              ) : null}
              <span className="resting-pair-name">
                {pairPlayersDisplayLabel(pair)}
              </span>
            </div>
          );
        })}
      </div>
      {restingPairs.length > 0 && (
        <div className="resting-pairs-info">
          <span className="resting-pairs-info-text">
            {pairsPlaying} parejas jugando ({courts} canchas × 2 parejas ={" "}
            {maxPairsThatCanPlay} máximo)
          </span>
        </div>
      )}
    </div>
  );
};

export default RestingPairsSection;
