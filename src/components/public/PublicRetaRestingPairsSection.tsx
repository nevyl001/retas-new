import React from "react";
import type { Pair, Match } from "../../lib/database";
import { pairPlayersDisplayLabel } from "../../lib/pairPlayerNames";
import {
  getPairTeamIndex,
  getPairTeamName,
  type TeamConfigLike,
} from "../../lib/teamConfigDisplay";
import { TeamBadge } from "../teams/TeamBadge";

function resolveRoundMatches(matches: Match[], round: number): Match[] {
  if (!matches.length) return [];
  const roundNums = new Set(matches.map((m) => m.round ?? round));
  if (roundNums.size === 1) return matches;
  return matches.filter((m) => (m.round ?? round) === round);
}

function getRestingPairs(pairs: Pair[], matches: Match[], round: number): Pair[] {
  const roundMatches = resolveRoundMatches(matches, round);
  const playingPairIds = new Set<string>();
  roundMatches.forEach((match) => {
    playingPairIds.add(match.pair1_id);
    playingPairIds.add(match.pair2_id);
  });
  return pairs.filter((pair) => !playingPairIds.has(pair.id));
}

export const PublicRetaRestingPairsSection: React.FC<{
  pairs: Pair[];
  matches: Match[];
  round: number;
  courts: number;
  pairLabelById?: Record<string, string>;
  teamConfig?: TeamConfigLike | null;
}> = ({
  pairs,
  matches,
  round,
  courts,
  pairLabelById = {},
  teamConfig = null,
}) => {
  const restingPairs = getRestingPairs(pairs, matches, round);
  if (restingPairs.length === 0) return null;

  const pairsPlaying = pairs.length - restingPairs.length;
  const maxPairsThatCanPlay = courts * 2;
  const showTeams = Boolean(
    teamConfig?.teamNames?.length &&
      teamConfig?.pairToTeam &&
      Object.keys(teamConfig.pairToTeam).length > 0
  );

  return (
    <div className="te-pub-resting te-pub-fade-in">
      <p className="te-pub-resting__title">
        <span className="te-pub-resting__icon" aria-hidden>
          😴
        </span>
        Parejas que descansan ({restingPairs.length})
      </p>
      <div className="te-pub-resting__pills">
        {restingPairs.map((pair) => {
          const teamName = showTeams
            ? getPairTeamName(pair.id, teamConfig, pair)
            : null;
          const teamIndex = showTeams
            ? getPairTeamIndex(pair.id, teamConfig, pair)
            : null;
          const playersLabel =
            pairLabelById[pair.id] ?? pairPlayersDisplayLabel(pair);

          return (
            <span
              key={pair.id}
              className={`te-pub-resting__pill${
                showTeams ? " te-pub-resting__pill--teams" : ""
              }`}
            >
              {teamName ? (
                <TeamBadge
                  name={teamName}
                  teamIndex={teamIndex ?? undefined}
                  className="te-pub-resting__team"
                />
              ) : null}
              <span className="te-pub-resting__players">{playersLabel}</span>
            </span>
          );
        })}
      </div>
      <p className="te-pub-resting__info">
        {pairsPlaying} parejas jugando ({courts} canchas × 2 parejas ={" "}
        {maxPairsThatCanPlay} máximo)
      </p>
    </div>
  );
};
