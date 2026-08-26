import React from "react";
import { TeamLogo } from "./TeamLogo";

export type RetaEquiposArenaSlot = {
  code: string;
  title: string;
  detail: string;
  live?: boolean;
};

type RetaEquiposArenaScoreboardProps = {
  teamAName: string;
  teamBName: string;
  logoA?: string | null;
  logoB?: string | null;
  scoreA: number | null;
  scoreB: number | null;
  /** Progreso global, p.ej. "2 / 12". */
  progressLabel?: string | null;
  slots?: RetaEquiposArenaSlot[];
  fecha?: string | null;
  horario?: string | null;
  lugar?: string | null;
  statusLabel?: string;
  isLive?: boolean;
};

function shortTeamLabel(name: string): string {
  const cleaned = name.replace(/^team\s+/i, "").trim();
  return cleaned || name;
}

function ArenaTxPill({
  fecha,
  horario,
  lugar,
  statusLabel,
  isLive,
}: {
  fecha?: string | null;
  horario?: string | null;
  lugar?: string | null;
  statusLabel?: string;
  isLive?: boolean;
}) {
  const hasMeta = Boolean(fecha || horario || lugar?.trim());
  if (!hasMeta && !statusLabel && !isLive) return null;

  return (
    <div className="reta-eq-arena__pill-wrap">
      <p className="reta-eq-arena__pill" aria-label="Datos del duelo">
        {fecha ? (
          <span className="reta-eq-arena__pill-fecha">{fecha}</span>
        ) : null}
        {fecha && horario ? (
          <span className="reta-eq-arena__pill-sep" aria-hidden>
            ·
          </span>
        ) : null}
        {horario ? <span>{horario}</span> : null}
        {(fecha || horario) && lugar?.trim() ? (
          <span className="reta-eq-arena__pill-sep" aria-hidden>
            ·
          </span>
        ) : null}
        {lugar?.trim() ? (
          <span className="reta-eq-arena__pill-lugar">{lugar.trim()}</span>
        ) : null}
        {isLive ? (
          <span className="reta-eq-arena__pill-live">EN VIVO</span>
        ) : statusLabel ? (
          <span className="reta-eq-arena__pill-status">{statusLabel}</span>
        ) : null}
      </p>
    </div>
  );
}

/**
 * Marcador público tipo broadcast arena (solo presentación).
 */
export const RetaEquiposArenaScoreboard: React.FC<
  RetaEquiposArenaScoreboardProps
> = ({
  teamAName,
  teamBName,
  logoA,
  logoB,
  scoreA,
  scoreB,
  progressLabel = null,
  slots = [],
  fecha = null,
  horario = null,
  lugar = null,
  statusLabel = "",
  isLive = false,
}) => {
  const labelA = shortTeamLabel(teamAName);
  const labelB = shortTeamLabel(teamBName);
  const digitA = scoreA == null ? "—" : String(scoreA);
  const digitB = scoreB == null ? "—" : String(scoreB);
  const showSlots = slots.length > 0;

  return (
    <div className="reta-eq-arena">
      <div
        className="reta-eq-arena__board"
        aria-label={`Marcador ${labelA} ${digitA} a ${digitB} ${labelB}`}
      >
        <div className="reta-eq-arena__glow reta-eq-arena__glow--a" aria-hidden />
        <div className="reta-eq-arena__glow reta-eq-arena__glow--b" aria-hidden />

        <div className="reta-eq-arena__row">
          <div className="reta-eq-arena__side reta-eq-arena__side--a">
            <TeamLogo
              logoUrl={logoA}
              teamName={teamAName}
              size="xl"
              loading="eager"
              className="reta-eq-arena__logo reta-eq-arena__logo--a"
            />
            <div className="reta-eq-arena__meta">
              <span className="reta-eq-arena__name">{labelA}</span>
              <span
                className="reta-eq-arena__digit reta-eq-arena__digit--a"
                aria-live="polite"
              >
                {digitA}
              </span>
            </div>
          </div>

          <div className="reta-eq-arena__center">
            <span className="reta-eq-arena__vs" aria-hidden>
              VS
            </span>
            {progressLabel ? (
              <span className="reta-eq-arena__progress">{progressLabel}</span>
            ) : null}
          </div>

          <div className="reta-eq-arena__side reta-eq-arena__side--b">
            <div className="reta-eq-arena__meta reta-eq-arena__meta--b">
              <span className="reta-eq-arena__name">{labelB}</span>
              <span
                className="reta-eq-arena__digit reta-eq-arena__digit--b"
                aria-live="polite"
              >
                {digitB}
              </span>
            </div>
            <TeamLogo
              logoUrl={logoB}
              teamName={teamBName}
              size="xl"
              loading="eager"
              className="reta-eq-arena__logo reta-eq-arena__logo--b"
            />
          </div>
        </div>

        {showSlots ? (
          <ul className="reta-eq-arena__slots" aria-label="Encuentros">
            {slots.map((slot) => (
              <li
                key={slot.code}
                className={[
                  "reta-eq-arena__slot",
                  slot.live ? "reta-eq-arena__slot--live" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className="reta-eq-arena__slot-code">{slot.code}</span>
                <span className="reta-eq-arena__slot-title">{slot.title}</span>
                <span className="reta-eq-arena__slot-detail">{slot.detail}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <ArenaTxPill
        fecha={fecha}
        horario={horario}
        lugar={lugar}
        statusLabel={statusLabel}
        isLive={isLive}
      />
    </div>
  );
};
