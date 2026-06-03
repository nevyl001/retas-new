import React from "react";
import type { Tournament } from "../../lib/database";
import {
  formatTournamentCourtsLabel,
  getTournamentCourtsCount,
  getTournamentModeBadge,
  getTournamentStatusBadge,
} from "../../lib/tournamentDisplay";
import { Badge } from "../ui";

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
  const status = getTournamentStatusBadge(tournament);
  const active = isActive(tournament);
  const courtsLabel = formatTournamentCourtsLabel(
    getTournamentCourtsCount(tournament)
  );

  const statusClass = tournament.is_finished
    ? "recent-reta-card--status-finished"
    : active
      ? "recent-reta-card--status-active"
      : "recent-reta-card--status-pending";

  return (
    <article
      className={`recent-reta-card ${statusClass}`}
    >
      <div className="recent-reta-card__badges">
        <Badge variant={mode.variant} className="recent-reta-card__mode">
          {mode.label}
        </Badge>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>
      <h3 className="recent-reta-card__name">{tournament.name}</h3>
      <p className="recent-reta-card__meta">{courtsLabel}</p>
      <button type="button" className="recent-reta-card__btn" onClick={onContinue}>
        {tournament.is_finished ? "Ver resultados →" : "Continuar →"}
      </button>
    </article>
  );
};
