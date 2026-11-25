import React, { useEffect, useMemo, useState } from "react";
import { PublicEventBrandIdentity } from "../../../club-experience";
import type { FlexAward } from "../../../lib/liga/flex/season";
import type { FlexHonorRow } from "../../../services/ligaFlexService";
import type { LigaJornadaPareja, LigaPartido } from "../../../lib/liga/types";
import { buildPublicJugadorByRivieraIdPath } from "../../jugadores/jugadoresPublicNav";
import type {
  FlexJornadaStandingRow,
  FlexRoundNavItem,
} from "./FlexPublicJornada";
import { LigaJornadaMatchPlayerPanel } from "../jornada-public/LigaJornadaMatchPlayerPanel";
import { FlexNeutralAvatar } from "./flexPublicUi";
import "../jornada-public/liga-jornada-public-match.css";
import "./flex-public-live.css";

type PublicProfile = {
  fotoUrl: string | null;
  rivieraId?: string | null;
  rating?: number | null;
};

export type FlexPublicLiveBoardProps = {
  club: string;
  leagueName: string;
  jornadaNumero: number;
  fecha: string;
  horario: string;
  statusLabel: string;
  totalRounds: number;
  focusRound: number | null;
  rounds: FlexRoundNavItem[];
  partidos: LigaPartido[];
  parejas: LigaJornadaPareja[];
  names: Map<string, string>;
  profiles: Record<string, PublicProfile>;
  convocados: string[];
  standingRows: FlexJornadaStandingRow[];
  official: boolean;
  jornadaHref: string;
  seasonAwards: FlexAward[];
  seasonResolution: FlexHonorRow | null;
  dataStale: boolean;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Icono Lucide Maximize2 (19×19 px) */
function Maximize2Icon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="19"
      height="19"
      aria-hidden="true"
      focusable="false"
    >
      <polyline
        points="15 3 21 3 21 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="9 21 3 21 3 15"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="21"
        y1="3"
        x2="14"
        y2="10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="3"
        y1="21"
        x2="10"
        y2="14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Icono Lucide Minimize2 (19×19 px) */
function Minimize2Icon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="19"
      height="19"
      aria-hidden="true"
      focusable="false"
    >
      <polyline
        points="4 14 10 14 10 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="20 10 14 10 14 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="14"
        y1="10"
        x2="21"
        y2="3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="3"
        y1="21"
        x2="10"
        y2="14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function roundMark(estado: FlexRoundNavItem["estado"]): string {
  if (estado === "confirmada") return "✓";
  if (estado === "actual") return "●";
  return "○";
}

export const FlexPublicLiveBoard: React.FC<FlexPublicLiveBoardProps> = ({
  club,
  leagueName,
  jornadaNumero,
  fecha,
  horario,
  statusLabel,
  totalRounds,
  focusRound,
  rounds,
  partidos,
  parejas,
  names,
  profiles,
  convocados,
  standingRows,
  official,
  dataStale,
}) => {
  const [historyRound, setHistoryRound] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && document.fullscreenElement) {
        void document.exitFullscreen?.().catch(() => undefined);
      }
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (
      historyRound != null &&
      !rounds.some((item) => item.ronda === historyRound && item.hasPartidos)
    ) {
      setHistoryRound(null);
    }
  }, [historyRound, rounds]);

  const viewingHistory = historyRound != null && historyRound !== focusRound;
  const visibleRound = viewingHistory ? historyRound : focusRound;
  const visibleMatches =
    visibleRound == null
      ? []
      : partidos
          .filter((partido) => partido.ronda === visibleRound)
          .slice()
          .sort((a, b) => (a.cancha ?? 0) - (b.cancha ?? 0));

  const remaining =
    focusRound == null ? totalRounds : Math.max(0, totalRounds - focusRound);

  const courtCols = Math.min(4, Math.max(1, visibleMatches.length || 3));

  const standingByPlayer = useMemo(() => {
    const map = new Map<string, FlexJornadaStandingRow>();
    for (const row of standingRows) map.set(row.jugadorId, row);
    return map;
  }, [standingRows]);

  const showPodiumNote =
    standingRows.some((row) => row.posicion === 1) &&
    standingRows.some((row) => row.posicion === 2) &&
    standingRows.some((row) => row.posicion === 3);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => undefined);
      return;
    }
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  const selectRound = (item: FlexRoundNavItem) => {
    if (!item.hasPartidos) return;
    setHistoryRound(item.ronda === focusRound ? null : item.ronda);
  };

  const activeRoundMeta =
    rounds.find((item) => item.ronda === visibleRound) ?? null;

  return (
    <div
      className={`flex-pub-live liga-pantalla App--public-full-width ro-public-view ro-surface-dark${
        fullscreen ? " is-fullscreen" : ""
      }`}
    >
      <div className="flex-pub-live__shell">
        {/* ═══════════════════════════════════════════════════════════════════
            ZONA SUPERIOR — IDENTIDAD Y PROGRESO (110–140 px en Full HD)
            ═══════════════════════════════════════════════════════════════════ */}
        <header className="flex-pub-live__topzone">
          <div className="flex-pub-live__identity-row">
            <div className="flex-pub-live__brand-wrap">
              <PublicEventBrandIdentity className="flex-pub-live__brand" />
            </div>

            <div className="flex-pub-live__titles">
              <div className="flex-pub-live__eyebrow-row">
                <p className="flex-pub-live__club">
                  {club || "Riviera Open"}
                  <span> · by Riviera Open</span>
                </p>
                <span
                  className={`flex-pub-live__status-pill${
                    statusLabel === "En curso"
                      ? " is-live"
                      : statusLabel === "Finalizada"
                        ? " is-done"
                        : ""
                  }`}
                >
                  <span className="flex-pub-live__status-dot" aria-hidden />
                  {statusLabel}
                </span>
              </div>

              <div className="flex-pub-live__headline-row">
                <h1 className="flex-pub-live__league">
                  {leagueName}
                  <span className="flex-pub-live__jornada-tag">
                    {" "}
                    — JORNADA {pad(jornadaNumero)}
                  </span>
                </h1>
                <p className="flex-pub-live__when">
                  {fecha}
                  {horario ? ` · ${horario}` : ""}
                </p>
              </div>
            </div>

            <button
              type="button"
              className="flex-pub-live__expand"
              aria-label="Expandir"
              title="Expandir"
              onClick={toggleFullscreen}
            >
              {fullscreen ? <Minimize2Icon /> : <Maximize2Icon />}
            </button>
          </div>

          <div
            className="flex-pub-live__progress-row"
            aria-label="Progreso de rondas"
          >
            {totalRounds > 0 && visibleRound != null ? (
              <div className="flex-pub-live__progress-copy">
                <p className="flex-pub-live__progress-now">
                  RONDA {pad(visibleRound)} DE {pad(totalRounds)}
                </p>
                <p className="flex-pub-live__progress-left">
                  {remaining === 0
                    ? "TODAS LAS RONDAS DISPUTADAS"
                    : remaining === 1
                      ? "1 RONDA POR DISPUTAR"
                      : `${remaining} RONDAS POR DISPUTAR`}
                </p>
              </div>
            ) : (
              <div className="flex-pub-live__progress-copy">
                <p className="flex-pub-live__progress-now">PROGRAMACIÓN</p>
                <p className="flex-pub-live__progress-left">
                  {totalRounds > 0
                    ? `${totalRounds} RONDAS POR DISPUTAR`
                    : "SIN RONDAS CONFIGURADAS"}
                </p>
              </div>
            )}

            {rounds.length > 0 ? (
              <div className="flex-pub-live__rounds-scroll">
                <div
                  className="flex-pub-live__rounds"
                  role="tablist"
                  aria-label="Rondas"
                >
                  {rounds.map((item) => {
                    const selected = item.ronda === visibleRound;
                    return (
                      <button
                        key={item.ronda}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        aria-label={`Ronda ${pad(item.ronda)}`}
                        disabled={!item.hasPartidos}
                        className={`flex-pub-live__round is-${item.estado}${
                          selected ? " is-selected" : ""
                        }`}
                        onClick={() => selectRound(item)}
                      >
                        <span className="flex-pub-live__round-code">
                          R{pad(item.ronda)}
                        </span>
                        <span
                          className="flex-pub-live__round-mark"
                          aria-hidden="true"
                        >
                          {roundMark(item.estado)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {viewingHistory ? (
              <button
                type="button"
                className="flex-pub-live__back-live"
                onClick={() => setHistoryRound(null)}
              >
                VOLVER A RONDA ACTUAL
              </button>
            ) : null}
          </div>
        </header>

        {dataStale ? (
          <p className="flex-pub-live__reconnect" role="status">
            Reconectando datos en tiempo real…
          </p>
        ) : null}

        {/* ═══════════════════════════════════════════════════════════════════
            ZONA CENTRAL — CANCHAS Y PARTIDOS (Protagonista deportiva)
            ═══════════════════════════════════════════════════════════════════ */}
        <section
          className="flex-pub-live__matches"
          aria-label="Canchas y partidos"
        >
          {partidos.length === 0 ? (
            <div className="flex-pub-live__empty">
              Esperando programación oficial de la jornada
            </div>
          ) : visibleMatches.length === 0 ? (
            <div className="flex-pub-live__empty">
              Esta ronda todavía no cuenta con partidos programados
            </div>
          ) : (
            <div
              className={`flex-pub-live__courts flex-pub-live__courts--${courtCols}`}
            >
              {visibleMatches.map((partido, index) => (
                <LiveMatch
                  key={partido.id}
                  partido={partido}
                  fallbackCourt={index + 1}
                  isCurrentRound={activeRoundMeta?.estado === "actual"}
                  parejas={parejas}
                  names={names}
                  profiles={profiles}
                />
              ))}
            </div>
          )}
        </section>

        <section
          className="flex-pub-participants-section"
          aria-label="Participantes"
        >
          <header className="flex-pub-section-head">
            <div className="flex-pub-section-head__titles">
              <h2 className="flex-pub-section-head__title">Participantes</h2>
              <p className="flex-pub-section-head__subtitle">
                Jugadores convocados y puntos individuales de la jornada
              </p>
            </div>
            <span className="flex-pub-section-head__count">
              {convocados.length}{" "}
              {convocados.length === 1 ? "Jugador" : "Jugadores"}
            </span>
          </header>
          {convocados.length === 0 ? (
            <div className="flex-pub-empty-card">
              Todavía no hay jugadores convocados.
            </div>
          ) : (
            <div className="flex-pub-participants-grid">
              {convocados.map((id) => {
                const name = names.get(id) ?? "Jugador";
                const profile = profiles[id];
                const standing = standingByPlayer.get(id);
                const hasResult = standing != null && standing.partidos > 0;
                const rivieraId = profile?.rivieraId?.trim() || null;
                return (
                  <article key={id} className="flex-pub-participant-card">
                    <FlexNeutralAvatar
                      name={name}
                      fotoUrl={profile?.fotoUrl}
                      variant="participant"
                    />
                    <div className="flex-pub-participant-card__center">
                      <p className="flex-pub-participant-card__name">{name}</p>
                      <p className="flex-pub-participant-card__id">
                        {rivieraId ? (
                          <a href={buildPublicJugadorByRivieraIdPath(rivieraId)}>
                            {rivieraId}
                          </a>
                        ) : (
                          "Sin Riviera ID"
                        )}
                      </p>
                    </div>
                    <div className="flex-pub-participant-card__right">
                      <span
                        className={`flex-pub-participant-card__pts-value${
                          hasResult
                            ? ""
                            : " flex-pub-participant-card__pts-value--pending"
                        }`}
                      >
                        {hasResult ? standing.puntos : "—"}
                      </span>
                      <span className="flex-pub-participant-card__pts-label">
                        PTS JORNADA
                      </span>
                      <span
                        className={`flex-pub-participant-card__pts-status${
                          hasResult
                            ? " flex-pub-participant-card__pts-status--scored"
                            : ""
                        }`}
                      >
                        {hasResult
                          ? `${standing.posicion}º · ${
                              official ? "Oficial" : "Provisional"
                            }`
                          : "Pendiente"}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section
          className="flex-pub-standings-section"
          aria-label="Clasificación de la jornada"
        >
            <header className="flex-pub-section-head">
              <div className="flex-pub-section-head__titles">
                <h2 className="flex-pub-section-head__title">
                  CLASIFICACIÓN DE LA JORNADA
                </h2>
                <p className="flex-pub-section-head__subtitle">
                  Jornada {pad(jornadaNumero)} ·{" "}
                  {official ? "Resultados oficiales" : "Clasificación provisional"}
                </p>
              </div>
              <span
                className={`flex-pub-round-status-badge ${
                  official
                    ? "flex-pub-round-status-badge--confirmada"
                    : "flex-pub-round-status-badge--actual"
                }`}
              >
                <span className="flex-pub-round-status-badge__dot" aria-hidden />
                {official ? "Resultados oficiales" : "Clasificación provisional"}
              </span>
            </header>

            {showPodiumNote ? (
              <aside className="flex-pub-podio-note">
                <p className="flex-pub-podio-note__title">
                  ¡Felicidades a los 3 primeros lugares!
                </p>
                <p className="flex-pub-podio-note__text">
                  Sigan dándolo todo en la cancha, porque cada partido cuenta.
                </p>
                <p className="flex-pub-podio-note__close">Vive Riviera Open.</p>
              </aside>
            ) : null}

            {standingRows.length === 0 ? (
              <div className="flex-pub-empty-card">
                Pendiente · en espera de resultados confirmados.
              </div>
            ) : (
            <div className="flex-pub-standings-card">
              <div className="flex-pub-standings-table-wrap">
                <table className="flex-pub-standings-table">
                  <thead>
                    <tr>
                      <th className="is-pos">Posición</th>
                      <th>Jugador</th>
                      <th className="is-num">Partidos disputados</th>
                      <th className="is-num">Puntos de jornada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standingRows.map((row) => {
                      const name = names.get(row.jugadorId) ?? "Jugador";
                      const profile = profiles[row.jugadorId];
                      const rivieraId = profile?.rivieraId?.trim() || null;
                      return (
                        <tr key={row.jugadorId}>
                          <td className="is-pos">
                            <span
                              className={`flex-pub-standings-pos${
                                row.posicion <= 3
                                  ? " flex-pub-standings-pos--top"
                                  : ""
                              }`}
                            >
                              #{row.posicion}
                            </span>
                          </td>
                          <td>
                            <div className="flex-pub-standings-player">
                              <FlexNeutralAvatar
                                name={name}
                                fotoUrl={profile?.fotoUrl}
                                variant="table"
                              />
                              <div className="flex-pub-standings-player__info">
                                <span className="flex-pub-standings-player__name">
                                  {name}
                                </span>
                                {rivieraId ? (
                                  <span className="flex-pub-standings-player__id">
                                    <a
                                      href={buildPublicJugadorByRivieraIdPath(
                                        rivieraId
                                      )}
                                    >
                                      {rivieraId}
                                    </a>
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="is-num">
                            <span className="flex-pub-standings-pj">
                              {row.partidos}
                            </span>
                          </td>
                          <td className="is-num">
                            <span className="flex-pub-standings-pts">
                              {row.puntos}
                              <small>PTS</small>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            )}
          </section>
      </div>
    </div>
  );
};

function LiveMatch({
  partido,
  fallbackCourt,
  isCurrentRound,
  parejas,
  names,
  profiles,
}: {
  partido: LigaPartido;
  fallbackCourt: number;
  isCurrentRound: boolean;
  parejas: LigaJornadaPareja[];
  names: Map<string, string>;
  profiles: Record<string, PublicProfile>;
}) {
  const byId = new Map(parejas.map((pareja) => [pareja.id, pareja]));
  const left = partido.pareja1 ?? byId.get(partido.pareja1_id);
  const right = partido.pareja2 ?? byId.get(partido.pareja2_id);
  const pairA = side(left, names, profiles);
  const pairB = side(right, names, profiles);
  const hasScore =
    partido.score_pareja1 != null && partido.score_pareja2 != null;
  const s1 = hasScore ? (partido.score_pareja1 as number) : null;
  const s2 = hasScore ? (partido.score_pareja2 as number) : null;
  const tie = hasScore && s1 === s2;
  const p1Wins = hasScore && !tie && (s1 as number) > (s2 as number);
  const p2Wins = hasScore && !tie && (s2 as number) > (s1 as number);

  const court =
    typeof partido.cancha === "number" && Number.isFinite(partido.cancha)
      ? partido.cancha
      : fallbackCourt;

  const isLive =
    !hasScore && (partido.estado === "in_progress" || isCurrentRound);
  const statusKey = hasScore ? "done" : isLive ? "live" : "pending";
  const statusLabel = hasScore
    ? "Finalizado"
    : isLive
      ? "En curso"
      : "Pendiente";

  return (
    <article className={`flex-pub-live-match is-${statusKey}`}>
      <header className="flex-pub-live-match__head">
        <span className="flex-pub-live-match__court">CANCHA {pad(court)}</span>
        <span className={`flex-pub-live-match__status is-${statusKey}`}>
          <span className="flex-pub-live-match__status-dot" aria-hidden />
          {statusLabel}
        </span>
      </header>

      {/* PAREJA A */}
      <div
        className={`flex-pub-live-match__team${
          p1Wins ? " is-win" : p2Wins ? " is-loss" : ""
        }`}
      >
        <PairSide players={pairA} />
      </div>

      {/* MARCADOR CENTRAL */}
      <div
        className={`flex-pub-live-match__center-score${
          hasScore ? " is-scored" : " is-pending"
        }`}
        aria-label={hasScore ? `Marcador ${s1} a ${s2}` : "Partido por jugar"}
      >
        <span className="flex-pub-live-match__center-line" aria-hidden />
        {hasScore ? (
          <div className="flex-pub-live-match__score-box">
            <span
              className={`flex-pub-live-match__score-num${
                p1Wins ? " is-win" : p2Wins ? " is-loss" : ""
              }`}
            >
              {s1}
            </span>
            <span className="flex-pub-live-match__score-sep">—</span>
            <span
              className={`flex-pub-live-match__score-num${
                p2Wins ? " is-win" : p1Wins ? " is-loss" : ""
              }`}
            >
              {s2}
            </span>
          </div>
        ) : (
          <div className="flex-pub-live-match__score-box is-vs">
            <span className="flex-pub-live-match__score-num is-muted">—</span>
            <span className="flex-pub-live-match__vs-pill">VS</span>
            <span className="flex-pub-live-match__score-num is-muted">—</span>
          </div>
        )}
        <span className="flex-pub-live-match__center-line" aria-hidden />
      </div>

      {/* PAREJA B */}
      <div
        className={`flex-pub-live-match__team${
          p2Wins ? " is-win" : p1Wins ? " is-loss" : ""
        }`}
      >
        <PairSide players={pairB} />
      </div>
    </article>
  );
}

function side(
  pareja: LigaJornadaPareja | undefined,
  names: Map<string, string>,
  profiles: Record<string, PublicProfile>
) {
  const id1 = pareja?.jugador1_id ?? "";
  const id2 = pareja?.jugador2_id ?? "";
  return [
    {
      id: id1,
      name: pareja?.jugador1?.nombre || names.get(id1) || "Jugador",
      foto: profiles[id1]?.fotoUrl ?? null,
      rating: profiles[id1]?.rating ?? null,
    },
    {
      id: id2,
      name: pareja?.jugador2?.nombre || names.get(id2) || "Jugador",
      foto: profiles[id2]?.fotoUrl ?? null,
      rating: profiles[id2]?.rating ?? null,
    },
  ];
}

function PairSide({
  players,
}: {
  players: Array<{
    id: string;
    name: string;
    foto: string | null;
    rating: number | null;
  }>;
}) {
  return (
    <div className="flex-pub-live-match__pair liga-jornada-match-pair-half__grid">
      {players.map((player, idx) => (
        <div className="flex-pub-live-match__slot" key={player.id || `${player.name}-${idx}`}>
          <LigaJornadaMatchPlayerPanel
            name={player.name}
            foto={player.foto}
            rating={player.rating}
          />
        </div>
      ))}
    </div>
  );
}
