import React, { useEffect, useMemo, useState } from "react";
import { PublicEventBrandIdentity } from "../../../club-experience";
import {
  honorResolution,
  rankFlexSeason,
  type FlexAward,
} from "../../../lib/liga/flex/season";
import type { FlexHonorRow } from "../../../services/ligaFlexService";
import type { LigaJornadaPareja, LigaPartido } from "../../../lib/liga/types";
import type {
  FlexJornadaStandingRow,
  FlexRoundNavItem,
} from "./FlexPublicJornada";
import { LigaJornadaMatchPlayerPanel } from "../jornada-public/LigaJornadaMatchPlayerPanel";
import { FlexNeutralAvatar } from "./flexPublicUi";
import "./flex-public-live.css";

type PublicProfile = {
  fotoUrl: string | null;
  rivieraId?: string | null;
  rating?: number | null;
};

type BoardRow = {
  jugadorId: string;
  posicion: number | null;
  puntos: number | null;
  count: number | null;
  gc: number | null;
  pg: number | null;
  resultado: string | null;
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
  official,
  jornadaHref,
  seasonAwards,
  seasonResolution,
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

  const season = useMemo(
    () =>
      rankFlexSeason({
        awards: seasonAwards,
        resolution: honorResolution(seasonResolution),
      }),
    [seasonAwards, seasonResolution]
  );

  const jornadaRows = useMemo(
    () =>
      buildLiveJornadaBoard({
        convocados,
        partidos,
        parejas,
      }),
    [convocados, parejas, partidos]
  );

  const hasSeasonResults =
    seasonAwards.length > 0 && season.ok && season.rows.length > 0;

  const generalRows = useMemo(() => {
    if (!season.ok || season.rows.length === 0) {
      return [];
    }
    const ranked = new Map(season.rows.map((row) => [row.jugadorId, row]));
    const ordered: BoardRow[] = season.rows.map((row) => ({
      jugadorId: row.jugadorId,
      posicion: row.posicion,
      puntos: row.puntos,
      count: row.jornadasJugadas,
      gc: null,
      pg: null,
      resultado: null,
    }));
    for (const id of convocados) {
      if (!ranked.has(id)) {
        ordered.push({
          jugadorId: id,
          posicion: null,
          puntos: null,
          count: null,
          gc: null,
          pg: null,
          resultado: null,
        });
      }
    }
    return ordered;
  }, [convocados, season]);

  const hasConfirmedJornada = jornadaRows.some((row) => row.resultado != null);

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

  const standingsSubtitle = official
    ? "OFICIAL · RESULTADOS DEFINITIVOS DE LA JORNADA"
    : hasConfirmedJornada
      ? "PROVISIONAL · POR RESULTADO DE LA JORNADA"
      : "PENDIENTE · EN ESPERA DE RESULTADOS CONFIRMADOS";

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

        {/* ═══════════════════════════════════════════════════════════════════
            ZONA INFERIOR — CLASIFICACIÓN DE LA JORNADA / GENERAL
            ═══════════════════════════════════════════════════════════════════ */}
        <section
          className="flex-pub-live__standings"
          aria-label="Clasificación"
        >
          <header className="flex-pub-live__standings-head">
            <div className="flex-pub-live__standings-titles">
              <div className="flex-pub-live__standings-title-row">
                <h2>CLASIFICACIÓN DE LA JORNADA</h2>
                <span
                  className={`flex-pub-live__standings-badge${
                    official
                      ? " is-official"
                      : hasConfirmedJornada
                        ? " is-provisional"
                        : ""
                  }`}
                >
                  {standingsSubtitle}
                </span>
              </div>
            </div>

            <div className="flex-pub-live__standings-actions">
              {official ? (
                <a className="flex-pub-live__final" href={jornadaHref}>
                  Ficha de jornada
                </a>
              ) : null}
            </div>
          </header>

          {convocados.length === 0 &&
          jornadaRows.length === 0 &&
          generalRows.length === 0 ? (
            <div className="flex-pub-live__empty flex-pub-live__empty--standings">
              Todavía no hay jugadores convocados en esta jornada.
            </div>
          ) : (
            <div className="flex-pub-live__tables is-split">
              <StandingsTable
                title="Jornada"
                caption="Orden: games a favor, diferencia y partidos ganados."
                rows={jornadaRows}
                names={names}
                profiles={profiles}
                kind="jornada"
              />
              <StandingsTable
                title="General"
                caption={
                  hasSeasonResults
                    ? "Puntos acumulados de temporada."
                    : season.ok
                      ? "Todavía no existen resultados oficiales acumulados de temporada. Los puntos generales se registran al cerrar oficialmente cada jornada."
                      : "La clasificación general está en espera de la resolución deportiva de un empate oficial."
                }
                rows={
                  generalRows.length > 0
                    ? generalRows
                    : convocados.map((jugadorId) => ({
                        jugadorId,
                        posicion: null,
                        puntos: null,
                        count: null,
                        gc: null,
                        pg: null,
                        resultado: null,
                      }))
                }
                names={names}
                profiles={profiles}
                kind="general"
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

function buildLiveJornadaBoard(input: {
  convocados: string[];
  partidos: LigaPartido[];
  parejas: LigaJornadaPareja[];
}): BoardRow[] {
  const stats = accumulateResults(input.partidos, input.parejas);
  const ids = input.convocados.length
    ? input.convocados.slice()
    : Array.from(stats.keys());
  for (const id of Array.from(stats.keys())) {
    if (!ids.includes(id)) ids.push(id);
  }

  const played: Array<{
    id: string;
    pj: number;
    gf: number;
    gc: number;
    pg: number;
  }> = [];
  const idle: string[] = [];
  for (const id of ids) {
    const stat = stats.get(id);
    if (!stat || stat.pj < 1) idle.push(id);
    else played.push({ id, ...stat });
  }
  played.sort((a, b) => {
    if (b.gf !== a.gf) return b.gf - a.gf;
    const diff = b.gf - b.gc - (a.gf - a.gc);
    if (diff !== 0) return diff;
    return b.pg - a.pg;
  });

  let place = 0;
  let previous = "";
  const rows: BoardRow[] = played.map((entry, index) => {
    const key = `${entry.gf}:${entry.gf - entry.gc}:${entry.pg}`;
    if (key !== previous) {
      place = index + 1;
      previous = key;
    }
    return {
      jugadorId: entry.id,
      posicion: place,
      puntos: entry.gf,
      count: entry.pj,
      gc: entry.gc,
      pg: entry.pg,
      resultado: `${entry.gf}–${entry.gc}`,
    };
  });
  for (const id of idle) rows.push(emptyBoardRow(id));
  return rows;
}

function emptyBoardRow(jugadorId: string): BoardRow {
  return {
    jugadorId,
    posicion: null,
    puntos: null,
    count: null,
    gc: null,
    pg: null,
    resultado: null,
  };
}

function accumulateResults(
  partidos: LigaPartido[],
  parejas: LigaJornadaPareja[]
): Map<string, { pj: number; gf: number; gc: number; pg: number }> {
  const byPareja = new Map(parejas.map((pareja) => [pareja.id, pareja]));
  const stats = new Map<
    string,
    { pj: number; gf: number; gc: number; pg: number }
  >();
  const add = (
    pareja: LigaJornadaPareja | undefined,
    gf: number,
    gc: number
  ) => {
    for (const id of [pareja?.jugador1_id, pareja?.jugador2_id]) {
      if (!id) continue;
      const current = stats.get(id) ?? { pj: 0, gf: 0, gc: 0, pg: 0 };
      current.pj += 1;
      current.gf += gf;
      current.gc += gc;
      if (gf > gc) current.pg += 1;
      stats.set(id, current);
    }
  };
  for (const partido of partidos) {
    if (partido.score_pareja1 == null || partido.score_pareja2 == null) continue;
    const left = partido.pareja1 ?? byPareja.get(partido.pareja1_id);
    const right = partido.pareja2 ?? byPareja.get(partido.pareja2_id);
    add(left, partido.score_pareja1, partido.score_pareja2);
    add(right, partido.score_pareja2, partido.score_pareja1);
  }
  return stats;
}

function StandingsTable({
  title,
  caption,
  rows,
  names,
  profiles,
  kind,
}: {
  title: string;
  caption: string;
  rows: BoardRow[];
  names: Map<string, string>;
  profiles: Record<string, PublicProfile>;
  kind: "jornada" | "general";
}) {
  const stat = (value: number | null) => (value != null ? value : "—");
  return (
    <div className="flex-pub-live__table-card">
      <header className="flex-pub-live__table-head">
        <h3>{title}</h3>
        <p>{caption}</p>
      </header>
      <table className="flex-pub-live__table">
        <thead>
          <tr>
            <th className="is-pos">POS</th>
            <th>JUGADOR</th>
            {kind === "jornada" ? (
              <>
                <th className="is-stat" title="Games a favor">
                  GF
                </th>
                <th className="is-stat" title="Games en contra">
                  GC
                </th>
                <th className="is-stat" title="Partidos ganados">
                  PG
                </th>
              </>
            ) : (
              <>
                <th className="is-stat" title="Jornadas jugadas">
                  JJ
                </th>
                <th className="is-pts" title="Puntos de temporada">
                  PTS
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const name = names.get(row.jugadorId) ?? "Jugador";
            const top = row.posicion != null && row.posicion <= 3;
            const posMod =
              row.posicion != null && row.posicion <= 3
                ? ` is-pos-${row.posicion}`
                : "";
            return (
              <tr
                key={row.jugadorId}
                className={top ? `is-top${posMod}` : undefined}
              >
                <td className="is-pos">
                  <span
                    className={`flex-pub-live__pos-badge${
                      top ? " is-top" : ""
                    }`}
                  >
                    {row.posicion != null ? row.posicion : "—"}
                  </span>
                </td>
                <td>
                  <span className="flex-pub-live__player">
                    <FlexNeutralAvatar
                      name={name}
                      fotoUrl={profiles[row.jugadorId]?.fotoUrl}
                      variant="table"
                    />
                    <span className="flex-pub-live__player-name">{name}</span>
                  </span>
                </td>
                {kind === "jornada" ? (
                  <>
                    <td className="is-stat is-gf">{stat(row.puntos)}</td>
                    <td className="is-stat">{stat(row.gc)}</td>
                    <td className="is-stat">{stat(row.pg)}</td>
                  </>
                ) : (
                  <>
                    <td className="is-stat">
                      {row.count != null && row.count > 0 ? row.count : "—"}
                    </td>
                    <td className="is-pts">
                      <span
                        className={`flex-pub-live__pts-val${
                          row.puntos != null ? " has-pts" : ""
                        }`}
                      >
                        {stat(row.puntos)}
                      </span>
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

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
    <div className="flex-pub-live-match__pair">
      {players.map((player, idx) => (
        <LigaJornadaMatchPlayerPanel
          key={player.id || `${player.name}-${idx}`}
          name={player.name}
          foto={player.foto}
          rating={player.rating}
        />
      ))}
    </div>
  );
}
