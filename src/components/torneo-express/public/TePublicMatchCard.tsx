import React from "react";
import type { TorneoExpressPartido } from "../../../lib/torneoExpress/types";
import { matchWinnerSideFromPartido } from "../../../lib/torneoExpress/partidoSets";
import {
  TePubMatchOutcome,
  TePubMatchStatus,
} from "../../public/tePubShared";
import { PartidoSetsScoreDisplay } from "../PartidoSetsScoreDisplay";
import { TePublicMatchMeta } from "./TePublicMatchMeta";

export const TePublicMatchCard: React.FC<{
  partido: TorneoExpressPartido;
  localLabel: string;
  visitLabel: string;
  enVivo: boolean;
  index: number;
}> = ({ partido, localLabel, visitLabel, enVivo, index }) => {
  const played = partido.estado === "jugado";
  const winnerSide = played ? matchWinnerSideFromPartido(partido) : null;
  const localWins = winnerSide === "local";
  const visitWins = winnerSide === "visitante";
  const isTie = played && !winnerSide;
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
          <PartidoSetsScoreDisplay
            partido={partido}
            variant="inline"
            className="te-pub-score"
          />
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
