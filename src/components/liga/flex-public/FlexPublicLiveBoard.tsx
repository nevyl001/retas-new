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
import { FlexNeutralAvatar } from "./flexPublicUi";
import "./flex-public-live.css";

type PublicProfile = { fotoUrl: string | null; rivieraId?: string | null };

type BoardRow = {
  jugadorId: string;
  posicion: number | null;
  puntos: number | null;
  count: number | null;
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

function splitRows(rows: BoardRow[]): [BoardRow[], BoardRow[]] {
  if (rows.length <= 6) return [rows, []];
  const mid = Math.ceil(rows.length / 2);
  return [rows.slice(0, mid), rows.slice(mid)];
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
  jornadaHref,
  seasonAwards,
  seasonResolution,
  dataStale,
}) => {
  const [historyRound, setHistoryRound] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [board, setBoard] = useState<"jornada" | "general">("jornada");

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
    () => buildBoard(convocados, standingRows),
    [convocados, standingRows]
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
    }));
    for (const id of convocados) {
      if (!ranked.has(id)) {
        ordered.push({
          jugadorId: id,
          posicion: null,
          puntos: null,
          count: null,
        });
      }
    }
    return ordered;
  }, [convocados, season]);

  const rows = board === "jornada" ? jornadaRows : generalRows;
  const [leftRows, rightRows] = splitRows(rows);
  const hasConfirmedJornada = standingRows.length > 0;

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

  const standingsSubtitle =
    board === "general"
      ? hasSeasonResults
        ? "OFICIAL · PUNTOS ACUMULADOS DE TEMPORADA"
        : season.ok
          ? "TEMPORADA EN CURSO · SIN JORNADAS CERRADAS"
          : "EMPATE OFICIAL EN ESPERA DE RESOLUCIÓN"
      : official
        ? "OFICIAL · RESULTADOS DEFINITIVOS DE LA JORNADA"
        : hasConfirmedJornada
          ? "PROVISIONAL · RESULTADOS CONFIRMADOS"
          : "PENDIENTE · EN ESPERA DE RESULTADOS CONFIRMADOS";

  return (
    <div
      className={`flex-pub-live liga-pantalla liga-pantalla--individual App--public-full-width ro-public-view ro-surface-dark${
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
                <h2>
                  {board === "jornada"
                    ? "CLASIFICACIÓN DE LA JORNADA"
                    : "CLASIFICACIÓN GENERAL"}
                </h2>
                <span
                  className={`flex-pub-live__standings-badge${
                    (board === "jornada" && official) ||
                    (board === "general" && hasSeasonResults)
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
              <div
                className="flex-pub-live__switch"
                role="tablist"
                aria-label="Tipo de clasificación"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={board === "jornada"}
                  className={board === "jornada" ? "is-on" : ""}
                  onClick={() => setBoard("jornada")}
                >
                  JORNADA
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={board === "general"}
                  className={board === "general" ? "is-on" : ""}
                  onClick={() => setBoard("general")}
                >
                  GENERAL
                </button>
              </div>
            </div>
          </header>

          {board === "general" && !hasSeasonResults ? (
            <div className="flex-pub-live__empty flex-pub-live__empty--standings">
              {season.ok
                ? "Todavía no existen resultados oficiales acumulados de temporada. Los puntos generales se registran al cerrar oficialmente cada jornada."
                : "La clasificación general está en espera de la resolución deportiva de un empate oficial."}
            </div>
          ) : convocados.length === 0 && rows.length === 0 ? (
            <div className="flex-pub-live__empty flex-pub-live__empty--standings">
              Todavía no hay jugadores convocados en esta jornada.
            </div>
          ) : (
            <div
              className={`flex-pub-live__tables${
                rightRows.length > 0 ? " is-split" : ""
              }`}
            >
              <StandingsTable
                rows={leftRows}
                names={names}
                profiles={profiles}
              />
              {rightRows.length > 0 ? (
                <StandingsTable
                  rows={rightRows}
                  names={names}
                  profiles={profiles}
                />
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

function buildBoard(
  convocados: string[],
  standingRows: FlexJornadaStandingRow[]
): BoardRow[] {
  if (standingRows.length === 0) {
    return convocados.map((jugadorId) => ({
      jugadorId,
      posicion: null,
      puntos: null,
      count: null,
    }));
  }
  const ranked = new Map(standingRows.map((row) => [row.jugadorId, row]));
  const ordered: BoardRow[] = standingRows.map((row) => ({
    jugadorId: row.jugadorId,
    posicion: row.posicion,
    puntos: row.puntos,
    count: row.partidos,
  }));
  for (const id of convocados) {
    if (!ranked.has(id)) {
      ordered.push({
        jugadorId: id,
        posicion: null,
        puntos: null,
        count: null,
      });
    }
  }
  return ordered;
}

function StandingsTable({
  rows,
  names,
  profiles,
}: {
  rows: BoardRow[];
  names: Map<string, string>;
  profiles: Record<string, PublicProfile>;
}) {
  return (
    <div className="flex-pub-live__table-card">
      <table className="flex-pub-live__table">
        <thead>
          <tr>
            <th className="is-pos">POS</th>
            <th>JUGADOR</th>
            <th className="is-pj">PJ</th>
            <th className="is-pts">PTS</th>
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
                <td className="is-pj">
                  {row.count != null && row.count > 0 ? row.count : "—"}
                </td>
                <td className="is-pts">
                  <span
                    className={`flex-pub-live__pts-val${
                      row.puntos != null ? " has-pts" : ""
                    }`}
                  >
                    {row.puntos != null ? row.puntos : "—"}
                  </span>
                </td>
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
        <PairSide players={pairA} profiles={profiles} />
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
                p1Wins ? " is-win" : ""
              }`}
            >
              {s1}
            </span>
            <span className="flex-pub-live-match__score-sep">—</span>
            <span
              className={`flex-pub-live-match__score-num${
                p2Wins ? " is-win" : ""
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
        <PairSide players={pairB} profiles={profiles} />
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
    },
    {
      id: id2,
      name: pareja?.jugador2?.nombre || names.get(id2) || "Jugador",
      foto: profiles[id2]?.fotoUrl ?? null,
    },
  ];
}

function PairSide({
  players,
  profiles,
}: {
  players: Array<{ id: string; name: string; foto: string | null }>;
  profiles: Record<string, PublicProfile>;
}) {
  return (
    <div className="flex-pub-live-match__pair">
      {players.map((player, idx) => (
        <div
          key={player.id || `${player.name}-${idx}`}
          className="flex-pub-live-match__player"
        >
          <FlexNeutralAvatar
            name={player.name}
            fotoUrl={player.foto ?? profiles[player.id]?.fotoUrl}
            variant="match"
          />
          <span className="flex-pub-live-match__player-name">
            {player.name}
          </span>
        </div>
      ))}
    </div>
  );
}
