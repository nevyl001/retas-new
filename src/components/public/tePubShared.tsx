import React from "react";
import { computeStandingDif } from "../../utils/standingsDisplay";

export function TePubDifPill({
  ptsFav,
  ptsCon,
}: {
  ptsFav: number;
  ptsCon: number;
}) {
  const dif = computeStandingDif(ptsFav, ptsCon);
  const mod =
    dif > 0 ? "te-pub-dif--pos" : dif < 0 ? "te-pub-dif--neg" : "te-pub-dif--zero";
  const label = dif > 0 ? `+${dif}` : String(dif);
  return <span className={`te-pub-dif ${mod}`}>{label}</span>;
}

export function TePubMatchStatus({
  variant,
}: {
  variant: "played" | "live" | "pending" | "finished";
}) {
  if (variant === "played" || variant === "finished") {
    return (
      <span className="te-pub-status te-pub-status--played">
        <span aria-hidden>✓</span>{" "}
        {variant === "finished" ? "Finalizado" : "Jugado"}
      </span>
    );
  }
  if (variant === "live") {
    return (
      <span className="te-pub-status te-pub-status--live">
        <span className="te-pub-status__dot" aria-hidden />
        En vivo
      </span>
    );
  }
  return <span className="te-pub-status te-pub-status--pending">Pendiente</span>;
}

export function tePubScoreNumModifier(options: {
  isWin?: boolean;
  isTie?: boolean;
}): string {
  if (options.isWin) return " te-pub-score__num--win";
  if (options.isTie) return " te-pub-score__num--tie";
  return "";
}

export function TePubMatchOutcome({
  winnerLabel,
  isTie = false,
}: {
  winnerLabel?: string | null;
  isTie?: boolean;
}) {
  if (winnerLabel) {
    return (
      <div className="te-pub-match-winner">
        <span className="te-pub-match-winner__icon" aria-hidden>
          🏆
        </span>
        <div className="te-pub-match-winner__body">
          <span className="te-pub-match-winner__label">Ganador</span>
          <span className="te-pub-match-winner__name">{winnerLabel}</span>
        </div>
      </div>
    );
  }
  if (isTie) {
    return (
      <div className="te-pub-match-winner te-pub-match-winner--tie">
        <span className="te-pub-match-winner__icon" aria-hidden>
          ⇄
        </span>
        <div className="te-pub-match-winner__body">
          <span className="te-pub-match-winner__label">Empate</span>
          <span className="te-pub-match-winner__name">Marcador igualado</span>
        </div>
      </div>
    );
  }
  return null;
}
