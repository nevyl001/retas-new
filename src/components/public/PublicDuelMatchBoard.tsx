import React from "react";
import { LigaJornadaMatchPairStack } from "../liga/jornada-public/LigaJornadaMatchPairStack";
import { LigaJornadaMatchScoreGrid } from "../liga/jornada-public/LigaJornadaMatchScoreGrid";
import { LigaJornadaMatchVsDivider } from "../liga/jornada-public/LigaJornadaMatchVsDivider";
import type { LigaJornadaMatchPairSide } from "../liga/jornada-public/ligaJornadaMatchTypes";
import "../liga/jornada-public/liga-jornada-public-match.css";
import "./public-duel-match.css";

export type PublicDuelPlayer = {
  name: string;
  fotoUrl?: string | null;
  rating?: number | null;
};

function toSide(
  players: PublicDuelPlayer[],
  fallbackLabel: string
): LigaJornadaMatchPairSide {
  const [p1, p2] = players;
  return {
    name1: p1?.name?.trim() || fallbackLabel,
    name2: p2?.name?.trim() || "—",
    foto1: p1?.fotoUrl ?? null,
    foto2: p2?.fotoUrl ?? null,
    rating1: p1?.rating ?? null,
    rating2: p2?.rating ?? null,
  };
}

/**
 * Mismo duelo premium que la jornada pública de Liga:
 * pareja vertical · VS · pareja vertical + marcador inferior.
 */
export const PublicDuelMatchBoard: React.FC<{
  sideA: PublicDuelPlayer[];
  sideB: PublicDuelPlayer[];
  labelA: string;
  labelB: string;
  scoreA: number | null;
  scoreB: number | null;
  hasResult: boolean;
}> = ({ sideA, sideB, labelA, labelB, scoreA, scoreB, hasResult }) => {
  const played =
    hasResult &&
    scoreA != null &&
    scoreB != null &&
    Number.isFinite(scoreA) &&
    Number.isFinite(scoreB);
  const isTie = played && scoreA === scoreB;
  const aWins = Boolean(
    played && !isTie && (scoreA as number) > (scoreB as number)
  );
  const bWins = Boolean(
    played && !isTie && (scoreB as number) > (scoreA as number)
  );

  const left = toSide(sideA, labelA);
  const right = toSide(sideB, labelB);

  return (
    <div className="liga-pantalla--jornada-fijas pub-duel-match-scope">
      <div
        className={`liga-jornada-match-card liga-jornada-match-card--final liga-jornada-match-card--broadcast liga-jornada-match-card--duel-row liga-jornada-match-card--duel-stacks${
          isTie ? " liga-jornada-match-card--draw" : ""
        }`}
      >
        <div className="liga-jornada-match-card__final-body">
          <div className="liga-jornada-match-card__duel">
            <LigaJornadaMatchPairStack
              side={left}
              align="left"
              tone={
                isTie ? undefined : aWins ? "win" : played ? "loss" : undefined
              }
              label={`${left.name1} y ${left.name2}`}
            />
            <LigaJornadaMatchVsDivider />
            <LigaJornadaMatchPairStack
              side={right}
              align="right"
              tone={
                isTie ? undefined : bWins ? "win" : played ? "loss" : undefined
              }
              label={`${right.name1} y ${right.name2}`}
            />
          </div>
          <div className="liga-jornada-match-card__final-score">
            {played ? (
              <LigaJornadaMatchScoreGrid
                board={{
                  kind: "simple",
                  s1: scoreA as number,
                  s2: scoreB as number,
                }}
                summaryOnly
                isDraw={isTie}
              />
            ) : (
              <div
                className="liga-jornada-match-score liga-jornada-match-score--summary-only"
                aria-label="Sin marcador"
              >
                <div className="liga-jornada-match-score__summary">
                  <span className="liga-jornada-match-score__summary-num">
                    —
                  </span>
                  <span className="liga-jornada-match-score__summary-sep">
                    –
                  </span>
                  <span className="liga-jornada-match-score__summary-num">
                    —
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicDuelMatchBoard;
