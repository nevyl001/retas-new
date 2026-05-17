import React from "react";
import type { Tournament } from "../../lib/database";
import { getTournamentModeBadge } from "../../lib/tournamentDisplay";

function isActive(t: Tournament): boolean {
  return Boolean(t.is_started && !t.is_finished);
}

interface RecentRetaCardProps {
  tournament: Tournament;
  onContinue: () => void;
}

export const RecentRetaCard: React.FC<RecentRetaCardProps> = ({
  tournament,
  onContinue,
}) => {
  const mode = getTournamentModeBadge(tournament);
  const active = isActive(tournament);

  return (
    <article
      className={`recent-reta-card${active ? " recent-reta-card--active" : ""}${
        tournament.is_finished ? " recent-reta-card--finished" : ""
      }`}
    >
      <span
        className="recent-reta-card__badge"
        style={{ borderColor: mode.color, color: mode.color }}
      >
        {mode.label}
      </span>
      <h3 className="recent-reta-card__name">{tournament.name}</h3>
      <p className="recent-reta-card__meta">
        {tournament.is_finished
          ? "Finalizada"
          : active
            ? "En curso"
            : "Pendiente"}
        {tournament.courts ? ` · ${tournament.courts} cancha(s)` : ""}
      </p>
      <button type="button" className="recent-reta-card__btn" onClick={onContinue}>
        {tournament.is_finished ? "Ver resultados →" : "Continuar →"}
      </button>
    </article>
  );
};
