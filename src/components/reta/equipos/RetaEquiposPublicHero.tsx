import React, { useMemo } from "react";
import { TEAMS_PUBLIC_FORMAT_LABEL } from "../../../lib/reta/teamsPublicCopy";
import { resolveTeamLogoUrl } from "../../../lib/reta/teamLogoDisplay";
import type { EventSchedulePhase } from "../../../lib/public/eventScheduleStatus";
import {
  formatPublicEventFecha,
  formatPublicEventHorario,
} from "../../../lib/public/eventScheduleStatus";
import { TeamLogo } from "./TeamLogo";
import { RetaEquiposCountdown } from "./RetaEquiposCountdown";
import { RetaEquiposTeamColumn } from "./RetaEquiposTeamColumn";
import type { RetaEquiposPlayerCardData } from "./RetaEquiposPlayerCard";

export type RetaEquiposRosterTeam = {
  teamIndex: number;
  name: string;
  players: RetaEquiposPlayerCardData[];
};

type RetaEquiposPublicHeroProps = {
  eventName?: string | null;
  teamNames: string[];
  teamLogos?: (string | null)[] | null;
  teams: RetaEquiposRosterTeam[];
  fechaHorario?: string | null;
  lugar?: string | null;
  statusLabel: string;
  schedulePhase?: EventSchedulePhase;
  programadoEn?: string | null;
  programadoHasta?: string | null;
  isFinished?: boolean;
  compact?: boolean;
  liveScoreLabel?: string | null;
  onGoLive?: () => void;
};

function resolveCtaLabel(
  phase: EventSchedulePhase | undefined,
  isFinished: boolean
): { label: string; live: boolean } {
  if (isFinished || phase === "after") {
    return { label: "VER RESULTADOS", live: false };
  }
  if (phase === "in_window" || phase === "unknown") {
    return { label: "EN VIVO · IR AL EN VIVO", live: true };
  }
  return { label: "VER ENFRENTAMIENTOS", live: false };
}

function shortTeamLabel(name: string): string {
  const cleaned = name.replace(/^team\s+/i, "").trim();
  return cleaned || name;
}

function TransmissionPill({
  fecha,
  horario,
  lugar,
  status,
}: {
  fecha: string | null;
  horario: string | null;
  lugar?: string | null;
  status: string;
}) {
  const parts: string[] = [];
  if (fecha) parts.push(fecha);
  if (horario) parts.push(horario);
  if (lugar?.trim()) parts.push(lugar.trim());
  if (status) parts.push(status);
  if (parts.length === 0) return null;

  return (
    <p className="reta-eq-tx-pill" aria-label="Datos del duelo">
      {parts.map((text, i) => (
        <React.Fragment key={`${text}-${i}`}>
          {i > 0 ? (
            <span className="reta-eq-tx-pill__sep" aria-hidden>
              ·
            </span>
          ) : null}
          <span className="reta-eq-tx-pill__item">{text}</span>
        </React.Fragment>
      ))}
    </p>
  );
}

export const RetaEquiposPublicHero: React.FC<RetaEquiposPublicHeroProps> = ({
  eventName,
  teamNames,
  teamLogos,
  teams,
  lugar,
  statusLabel,
  schedulePhase,
  programadoEn,
  programadoHasta,
  isFinished = false,
  compact = false,
  liveScoreLabel = null,
  onGoLive,
}) => {
  const teamA = teams[0];
  const teamB = teams[1];
  const nameA = teamNames[0]?.trim() || teamA?.name || "Equipo 1";
  const nameB = teamNames[1]?.trim() || teamB?.name || "Equipo 2";
  const labelA = shortTeamLabel(nameA);
  const labelB = shortTeamLabel(nameB);
  const logoA = resolveTeamLogoUrl(teamLogos, 0);
  const logoB = resolveTeamLogoUrl(teamLogos, 1);
  const playersA = teamA?.players ?? [];
  const playersB = teamB?.players ?? [];
  const cta = resolveCtaLabel(schedulePhase, isFinished);

  const fechaOnly = useMemo(
    () => formatPublicEventFecha(programadoEn),
    [programadoEn]
  );
  const horarioOnly = useMemo(
    () => formatPublicEventHorario(programadoEn, programadoHasta),
    [programadoEn, programadoHasta]
  );

  const eventTitle = eventName?.trim() || null;
  const defaultVs = `${nameA} vs ${nameB}`;
  const showEventTitle =
    Boolean(eventTitle) &&
    eventTitle!.toLowerCase() !== defaultVs.toLowerCase() &&
    !eventTitle!.toLowerCase().includes(labelA.toLowerCase());

  if (compact) {
    return (
      <header className="reta-eq-live-header reta-eq-anim-in">
        <div className="reta-eq-live-header__row">
          <div className="reta-eq-live-header__side">
            <TeamLogo
              logoUrl={logoA}
              teamName={nameA}
              size="xl"
              loading="eager"
              className="reta-eq-matchbar__logo reta-eq-matchbar__logo--a"
            />
            <span className="reta-eq-live-header__name">{labelA}</span>
          </div>
          <div
            className="reta-eq-live-header__score"
            aria-label="Marcador de equipos"
          >
            {liveScoreLabel || "VS"}
          </div>
          <div className="reta-eq-live-header__side reta-eq-live-header__side--b">
            <span className="reta-eq-live-header__name">{labelB}</span>
            <TeamLogo
              logoUrl={logoB}
              teamName={nameB}
              size="xl"
              loading="eager"
              className="reta-eq-matchbar__logo reta-eq-matchbar__logo--b"
            />
          </div>
        </div>
        <TransmissionPill
          fecha={fechaOnly}
          horario={horarioOnly}
          lugar={lugar}
          status={statusLabel}
        />
      </header>
    );
  }

  return (
    <section className="reta-eq-stage reta-eq-anim-in">
      <div className="reta-eq-stage__shell">
        <header className="reta-eq-stage__header">
          {showEventTitle ? (
            <h1 className="reta-eq-stage__title">{eventTitle}</h1>
          ) : (
            <h1 className="reta-eq-stage__title visually-hidden">
              {labelA} versus {labelB}
            </h1>
          )}
          <p className="visually-hidden">{TEAMS_PUBLIC_FORMAT_LABEL}</p>
        </header>

        <div
          className="reta-eq-matchbar"
          aria-label={`${labelA} versus ${labelB}`}
        >
          <div className="reta-eq-matchbar__side reta-eq-matchbar__side--a">
            <TeamLogo
              logoUrl={logoA}
              teamName={nameA}
              size="xl"
              loading="eager"
              className="reta-eq-matchbar__logo reta-eq-matchbar__logo--a"
            />
            <span className="reta-eq-matchbar__name">{labelA}</span>
          </div>
          <span className="reta-eq-matchbar__vs" aria-hidden>
            VS
          </span>
          <div className="reta-eq-matchbar__side reta-eq-matchbar__side--b">
            <span className="reta-eq-matchbar__name">{labelB}</span>
            <TeamLogo
              logoUrl={logoB}
              teamName={nameB}
              size="xl"
              loading="eager"
              className="reta-eq-matchbar__logo reta-eq-matchbar__logo--b"
            />
          </div>
        </div>

        <div className="reta-eq-grid">
          <div className="reta-eq-grid__a">
            <RetaEquiposTeamColumn
              teamName={labelA}
              logoUrl={logoA}
              players={playersA}
              side="a"
              staggerMs={0}
              showIdentity={false}
            />
          </div>

          <div className="reta-eq-grid__b">
            <RetaEquiposTeamColumn
              teamName={labelB}
              logoUrl={logoB}
              players={playersB}
              side="b"
              staggerMs={500}
              showIdentity={false}
            />
          </div>

          <div className="reta-eq-grid__center">
            <div className="reta-eq-center">
              <TransmissionPill
                fecha={fechaOnly}
                horario={horarioOnly}
                lugar={lugar}
                status={statusLabel}
              />
              <div className="reta-eq-center__countdown">
                <RetaEquiposCountdown
                  programadoEn={programadoEn}
                  programadoHasta={programadoHasta}
                  isFinished={isFinished}
                />
              </div>
              {onGoLive ? (
                <button
                  type="button"
                  className={[
                    "reta-eq-cta",
                    cta.live ? "reta-eq-cta--live" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={onGoLive}
                >
                  {cta.live ? (
                    <span className="reta-eq-cta__dot" aria-hidden />
                  ) : null}
                  <span className="reta-eq-cta__label">{cta.label}</span>
                  <span className="reta-eq-cta__arrow" aria-hidden>
                    →
                  </span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
