import React from "react";
import {
  getRetaMetaLine,
  getRetaModeBadge,
  getRetaName,
  getRetaStatusBadge,
  isRetaActive,
  isRetaFinished,
  type HomeRetaItem,
} from "../../lib/retasList";
import { Badge } from "../ui";

export type RecentRetaCardVariant = "featured" | "row";

interface RecentRetaCardProps {
  item: HomeRetaItem;
  onContinue: () => void;
  /** featured = protagonistas (activos); row = lista compacta (finalizados) */
  variant?: RecentRetaCardVariant;
  /** @deprecated Prefer variant. compact → row */
  compact?: boolean;
}

export const RecentRetaCard: React.FC<RecentRetaCardProps> = ({
  item,
  onContinue,
  variant,
  compact = false,
}) => {
  const resolvedVariant: RecentRetaCardVariant =
    variant ?? (compact ? "row" : "featured");
  const isRow = resolvedVariant === "row";

  const mode = getRetaModeBadge(item);
  const status = getRetaStatusBadge(item);
  const active = isRetaActive(item);
  const finished = isRetaFinished(item);

  const statusClass = finished
    ? "recent-reta-card--status-finished"
    : active
      ? "recent-reta-card--status-active"
      : "recent-reta-card--status-pending";

  return (
    <article
      className={[
        "recent-reta-card",
        statusClass,
        isRow ? "recent-reta-card--row" : "recent-reta-card--featured",
      ].join(" ")}
    >
      <div className="recent-reta-card__badges">
        <Badge variant={mode.variant} className="recent-reta-card__mode">
          {mode.label}
        </Badge>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>
      <h3 className="recent-reta-card__name">{getRetaName(item)}</h3>
      {!isRow ? (
        <p className="recent-reta-card__meta">{getRetaMetaLine(item)}</p>
      ) : null}
      <button type="button" className="recent-reta-card__btn" onClick={onContinue}>
        {finished ? "Ver resultados →" : "Continuar →"}
      </button>
    </article>
  );
};
