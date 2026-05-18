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
