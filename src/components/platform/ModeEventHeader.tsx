import React from "react";
import { StatusBadge } from "./StatusBadge";

export const ModeEventHeader: React.FC<{
  eyebrow?: string;
  title: string;
  modality?: string;
  statusLabel: string;
  statusVariant?: "live" | "pending" | "gold" | "muted";
  summary?: string;
  nextActionLabel?: string;
  onNextAction?: () => void;
  className?: string;
}> = ({
  eyebrow,
  title,
  modality,
  statusLabel,
  statusVariant = "pending",
  summary,
  nextActionLabel,
  onNextAction,
  className = "",
}) => (
  <header className={["mode-event-header", className].filter(Boolean).join(" ")}>
    {eyebrow ? <p className="mode-event-header__eyebrow">{eyebrow}</p> : null}
    <div className="mode-event-header__top">
      <h2 className="mode-event-header__title">{title}</h2>
      <StatusBadge variant={statusVariant}>{statusLabel}</StatusBadge>
    </div>
    {modality ? <p className="mode-event-header__modality">{modality}</p> : null}
    {summary ? <p className="mode-event-header__summary">{summary}</p> : null}
    {nextActionLabel && onNextAction ? (
      <button
        type="button"
        className="mode-event-header__next riviera-btn riviera-btn-primary riviera-btn--md"
        onClick={onNextAction}
      >
        {nextActionLabel}
      </button>
    ) : null}
  </header>
);
