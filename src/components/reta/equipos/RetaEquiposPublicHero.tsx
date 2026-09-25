import React, { useMemo } from "react";
import {
  TEAMS_PUBLIC_CLUB_FALLBACK,
  formatBroadcastBattleTitle,
} from "../../../lib/reta/teamsPublicCopy";
import { resolveTeamLogoUrl } from "../../../lib/reta/teamLogoDisplay";
import type { EventSchedulePhase } from "../../../lib/public/eventScheduleStatus";
import {
  formatPublicEventFecha,
  formatPublicEventHorario,
} from "../../../lib/public/eventScheduleStatus";
import { useTeamLogoAccentColors } from "../../../hooks/useTeamLogoAccentColors";
import { TeamLogo } from "./TeamLogo";
import { RetaEquiposCountdown } from "./RetaEquiposCountdown";
import { RetaEquiposTeamCylinder } from "./RetaEquiposTeamCylinder";
import {
  RetaEquiposArenaScoreboard,
  type RetaEquiposArenaSlot,
} from "./RetaEquiposArenaScoreboard";
import type { RetaEquiposPlayerCardData } from "./RetaEquiposPlayerCard";

export type RetaEquiposRosterTeam = {
  teamIndex: number;
  name: string;
  players: RetaEquiposPlayerCardData[];
};

type RetaEquiposPublicHeroProps = {
  eventName?: string | null;
  /** Descripción corta del encuentro (fallback de título si el name es el VS). */
  eventDescription?: string | null;
  /** Nombre del club / organizador (subtítulo). */
  clubName?: string | null;
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
  /** Marcador por bando (arena). Si falta, se parsea liveScoreLabel. */
  liveScoreA?: number | null;
  liveScoreB?: number | null;
  /** Progreso global p.ej. "2 / 12". */
  liveProgressLabel?: string | null;
  arenaSlots?: RetaEquiposArenaSlot[];
  onGoLive?: () => void;
  onBackToLineup?: () => void;
};

function parseScorePair(
  label: string | null | undefined
): { a: number; b: number } | null {
  if (!label) return null;
  const m = label.match(/(\d+)\s*[—–-]\s*(\d+)/);
  if (!m) return null;
  return { a: Number(m[1]), b: Number(m[2]) };
}

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

/** Fecha compacta broadcast: JUEVES · 24 SEP 2026 */
function formatBroadcastMarqueeDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const weekday = new Intl.DateTimeFormat("es-MX", { weekday: "long" })
    .format(d)
    .toUpperCase();
  const day = new Intl.DateTimeFormat("es-MX", { day: "numeric" }).format(d);
  const month = new Intl.DateTimeFormat("es-MX", { month: "short" })
    .format(d)
    .replace(/\./g, "")
    .toUpperCase();
  const year = new Intl.DateTimeFormat("es-MX", { year: "numeric" }).format(d);
  return `${weekday} · ${day} ${month} ${year}`;
}

export const RetaEquiposPublicHero: React.FC<RetaEquiposPublicHeroProps> = ({
  eventName,
  eventDescription = null,
  clubName,
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
  liveScoreA = null,
  liveScoreB = null,
  liveProgressLabel = null,
  arenaSlots = [],
  onGoLive,
  onBackToLineup,
}) => {
  const teamA = teams[0];
  const teamB = teams[1];
  const nameA = teamNames[0]?.trim() || teamA?.name || "Equipo 1";
  const nameB = teamNames[1]?.trim() || teamB?.name || "Equipo 2";
  const labelA = shortTeamLabel(nameA);
  const labelB = shortTeamLabel(nameB);
  const logoA = resolveTeamLogoUrl(teamLogos, 0);
  const logoB = resolveTeamLogoUrl(teamLogos, 1);
  const { style: teamAccentStyle } = useTeamLogoAccentColors(logoA, logoB);
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
  const marqueeDate = useMemo(
    () => formatBroadcastMarqueeDate(programadoEn),
    [programadoEn]
  );

  const parsedScores = useMemo(
    () => parseScorePair(liveScoreLabel),
    [liveScoreLabel]
  );
  const scoreA =
    liveScoreA != null ? liveScoreA : parsedScores?.a ?? null;
  const scoreB =
    liveScoreB != null ? liveScoreB : parsedScores?.b ?? null;
  const arenaLive =
    !isFinished &&
    (schedulePhase === "in_window" || schedulePhase === "unknown");

  const sedeLabel = lugar?.trim() || null;
  const eventTitle = eventName?.trim() || null;
  const headline = formatBroadcastBattleTitle(eventTitle, [nameA, nameB], eventDescription);
  const clubLine = clubName?.trim() || TEAMS_PUBLIC_CLUB_FALLBACK;
  const showCountdown = !cta.live && !isFinished && schedulePhase !== "after";

  if (compact) {
    return (
      <header
        className="reta-eq-live-header reta-eq-anim-in"
        style={teamAccentStyle}
      >
        <RetaEquiposArenaScoreboard
          teamAName={nameA}
          teamBName={nameB}
          logoA={logoA}
          logoB={logoB}
          scoreA={scoreA}
          scoreB={scoreB}
          progressLabel={liveProgressLabel}
          slots={arenaSlots}
          fecha={fechaOnly}
          horario={horarioOnly}
          lugar={lugar}
          statusLabel={statusLabel}
          isLive={arenaLive}
          onBackToLineup={onBackToLineup}
        />
      </header>
    );
  }

  return (
    <section
      className="reta-eq-stage reta-eq-stage--broadcast reta-eq-anim-in"
      style={teamAccentStyle}
    >
      <div className="reta-eq-stage__grid" aria-hidden />
      <div className="reta-eq-stage__glow reta-eq-stage__glow--a" aria-hidden />
      <div className="reta-eq-stage__glow reta-eq-stage__glow--b" aria-hidden />

      <div className="reta-eq-stage__shell">
        <div className="reta-eq-match-hero">
          <header className="reta-eq-stage__header reta-eq-stage__header--broadcast">
            <h1 className="reta-eq-stage__battle-title">{headline}</h1>
            {marqueeDate ? (
              <p className="reta-eq-stage__marquee-date">{marqueeDate}</p>
            ) : null}
            <p className="reta-eq-stage__club">by {clubLine}</p>
          </header>

          <div
            className="reta-eq-faceoff"
            aria-label={`${labelA} versus ${labelB}`}
          >
            <div className="reta-eq-faceoff__team reta-eq-faceoff__team--a">
              <TeamLogo
                logoUrl={logoA}
                teamName={nameA}
                size="xl"
                loading="eager"
                className="reta-eq-faceoff__logo reta-eq-faceoff__logo--a"
              />
              <span className="reta-eq-faceoff__name reta-eq-faceoff__name--a">
                {labelA}
              </span>
            </div>
            <span className="reta-eq-faceoff__vs" aria-hidden>
              vs
            </span>
            <div className="reta-eq-faceoff__team reta-eq-faceoff__team--b">
              <TeamLogo
                logoUrl={logoB}
                teamName={nameB}
                size="xl"
                loading="eager"
                className="reta-eq-faceoff__logo reta-eq-faceoff__logo--b"
              />
              <span className="reta-eq-faceoff__name reta-eq-faceoff__name--b">
                {labelB}
              </span>
            </div>
          </div>
        </div>

        <div className="reta-eq-duel-stage reta-eq-rosters">
          <div className="reta-eq-duel-stage__side reta-eq-duel-stage__side--a">
            <RetaEquiposTeamCylinder
              players={playersA}
              teamName={labelA}
              side="a"
              direction="left"
            />
          </div>
          <div className="reta-eq-duel-stage__laser" aria-hidden />
          <div className="reta-eq-duel-stage__side reta-eq-duel-stage__side--b">
            <RetaEquiposTeamCylinder
              players={playersB}
              teamName={labelB}
              side="b"
              direction="right"
            />
          </div>
        </div>

        <div
          className={[
            "reta-eq-event-bar",
            "reta-eq-event-bar--strip",
            cta.live ? "reta-eq-event-bar--live" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {sedeLabel ? (
            <span className="reta-eq-event-bar__item reta-eq-event-bar__sede">
              {sedeLabel}
            </span>
          ) : null}
          {horarioOnly ? (
            <span className="reta-eq-event-bar__item reta-eq-event-bar__time">
              {horarioOnly}
            </span>
          ) : null}
          {!cta.live && statusLabel ? (
            <span className="reta-eq-event-bar__item reta-eq-event-bar__status">
              {statusLabel}
            </span>
          ) : null}
          {showCountdown ? (
            <div className="reta-eq-event-bar__countdown">
              <RetaEquiposCountdown
                programadoEn={programadoEn}
                programadoHasta={programadoHasta}
                isFinished={isFinished}
              />
            </div>
          ) : null}
          {onGoLive ? (
            <button
              type="button"
              className={[
                "reta-eq-cta",
                "reta-eq-cta--strip",
                cta.live ? "reta-eq-cta--hub" : "",
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
    </section>
  );
};
