import React from "react";

export type DueloMatchCommandHeaderProps = {
  title: string;
  statusLabel: string;
  phaseLabel: string;
  modality?: string;
  teamAName: string;
  teamBName: string;
  scoreA: number;
  scoreB: number;
  scheduleLine: string;
  venueLine: string;
  metaLine?: string;
  className?: string;
};

/**
 * Cabecera tipo scoreboard para la consola de gestión Duelo 2v2.
 * Solo se usa en Gestionar — no afecta otros Quick Modes.
 */
export function DueloMatchCommandHeader({
  title,
  statusLabel,
  phaseLabel,
  modality = "Duelo 2 vs 2",
  teamAName,
  teamBName,
  scoreA,
  scoreB,
  scheduleLine,
  venueLine,
  metaLine,
  className = "",
}: DueloMatchCommandHeaderProps) {
  return (
    <header
      className={`duelo2v2-command-header ${className}`.trim()}
      aria-label="Resumen del partido"
    >
      <div className="duelo2v2-command-header__identity">
        <div className="duelo2v2-command-header__title-row">
          <h1 className="duelo2v2-command-header__title">{title}</h1>
          <span className="duelo2v2-command-header__status">{statusLabel}</span>
        </div>
        <p className="duelo2v2-command-header__phase">
          {phaseLabel}
          <span className="duelo2v2-command-header__dot" aria-hidden>
            ·
          </span>
          {modality}
        </p>
        <div className="duelo2v2-command-header__meta">
          <span>{scheduleLine}</span>
          <span>{venueLine}</span>
          {metaLine ? <span>{metaLine}</span> : null}
        </div>
      </div>

      <div className="duelo2v2-command-header__scoreboard" aria-label="Marcador">
        <div className="duelo2v2-command-header__team duelo2v2-command-header__team--a">
          <span className="duelo2v2-command-header__team-label">Pareja A</span>
          <span className="duelo2v2-command-header__team-name">{teamAName}</span>
        </div>
        <div className="duelo2v2-command-header__score" aria-hidden>
          <span className="duelo2v2-command-header__score-num">{scoreA}</span>
          <span className="duelo2v2-command-header__score-sep">:</span>
          <span className="duelo2v2-command-header__score-num">{scoreB}</span>
        </div>
        <div className="duelo2v2-command-header__team duelo2v2-command-header__team--b">
          <span className="duelo2v2-command-header__team-label">Pareja B</span>
          <span className="duelo2v2-command-header__team-name">{teamBName}</span>
        </div>
      </div>
    </header>
  );
}
