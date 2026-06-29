import React from "react";
import type { TorneoExpressPartido } from "../../../lib/torneoExpress/types";
import {
  TePubMatchOutcome,
  TePubMatchStatus,
  tePubScoreNumModifier,
} from "../../public/tePubShared";
import { useCountUp } from "./useCountUp";
import { TePublicMatchMeta } from "./TePublicMatchMeta";

function AnimatedScore({
  value,
  isWin,
  isTie,
  animate,
}: {
  value: number;
  isWin: boolean;
  isTie: boolean;
  animate: boolean;
}) {
  const displayed = useCountUp(value, { enabled: animate });
  return (
    <span
      className={`te-pub-score__num${tePubScoreNumModifier({ isWin, isTie })}`}
    >
      {displayed}
    </span>
  );
}

export const TePublicMatchCard: React.FC<{
  partido: TorneoExpressPartido;
  localLabel: string;
  visitLabel: string;
  enVivo: boolean;
  index: number;
}> = ({ partido, localLabel, visitLabel, enVivo, index }) => {
  const played = partido.estado === "jugado";
  const pl = partido.puntos_local ?? 0;
  const pv = partido.puntos_visitante ?? 0;
  const localWins = played && pl > pv;
  const visitWins = played && pv > pl;
  const isTie = played && pl === pv;
  const winnerLabel = localWins
    ? localLabel
    : visitWins
      ? visitLabel
      : null;

  return (
    <article
      className={`te-pub-match te-pub-fade-in-up${isTie ? " te-pub-match--tie" : ""}`}
      style={{ animationDelay: `${0.12 + index * 0.07}s` }}
    >
      <div className="te-pub-match__top">
        <TePubMatchStatus
          variant={played ? "played" : enVivo ? "live" : "pending"}
        />
      </div>
      <TePublicMatchMeta partido={partido} />

      <div className="te-pub-match__score-block">
        {played ? (
          <div className="te-pub-score">
            <AnimatedScore
              value={pl}
              isWin={localWins}
              isTie={isTie}
              animate={played}
            />
            <span className="te-pub-score__sep">—</span>
            <AnimatedScore
              value={pv}
              isWin={visitWins}
              isTie={isTie}
              animate={played}
            />
          </div>
        ) : (
          <span className="te-pub-score te-pub-score--pending">—</span>
        )}
      </div>

      <div className="te-pub-match__teams">
        <span
          className={`te-pub-match__team${
            localWins ? " te-pub-match__team--win" : isTie ? " te-pub-match__team--tie" : ""
          }`}
        >
          {localLabel}
        </span>
        <span className="te-pub-match__vs">vs</span>
        <span
          className={`te-pub-match__team${
            visitWins ? " te-pub-match__team--win" : isTie ? " te-pub-match__team--tie" : ""
          }`}
        >
          {visitLabel}
        </span>
      </div>

      <TePubMatchOutcome winnerLabel={winnerLabel} isTie={isTie} />
    </article>
  );
};
