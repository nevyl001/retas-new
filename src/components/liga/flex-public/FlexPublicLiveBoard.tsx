import React, { useEffect, useMemo, useState } from "react";
import { PublicEventBrandIdentity } from "../../../club-experience";
import { honorResolution, rankFlexSeason, type FlexAward } from "../../../lib/liga/flex/season";
import type { FlexHonorRow } from "../../../services/ligaFlexService";
import type { LigaJornadaPareja, LigaPartido } from "../../../lib/liga/types";
import type { FlexJornadaStandingRow, FlexRoundNavItem } from "./FlexPublicJornada";
import { FlexNeutralAvatar, useFlexPublicFonts } from "./flexPublicUi";
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

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7"
        fill="none"
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
  if (rows.length <= 8) return [rows, []];
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
  useFlexPublicFonts();
  const [historyRound, setHistoryRound] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [board, setBoard] = useState<"jornada" | "general">("jornada");

  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
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
  const visiblePending =
    visibleMatches.length > 0 &&
    visibleMatches.every(
      (partido) => partido.score_pareja1 == null || partido.score_pareja2 == null
    );
  const remaining =
    focusRound == null ? totalRounds : Math.max(0, totalRounds - focusRound);
  const courtCols = Math.min(4, Math.max(1, visibleMatches.length));

  const season = useMemo(
    () =>
      rankFlexSeason({
        awards: seasonAwards,
        resolution: honorResolution(seasonResolution),
      }),
    [seasonAwards, seasonResolution]
  );

  const jornadaRows = useMemo(() => buildBoard(convocados, standingRows), [convocados, standingRows]);
  const generalRows = useMemo(() => {
    if (!season.ok) {
      return convocados.map((jugadorId) => ({
        jugadorId,
        posicion: null,
        puntos: null,
        count: null,
      }));
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
        ordered.push({ jugadorId: id, posicion: null, puntos: null, count: null });
      }
    }
    return ordered;
  }, [convocados, season]);

  const rows = board === "jornada" ? jornadaRows : generalRows;
  const [leftRows, rightRows] = splitRows(rows);
  const hasConfirmed = board === "jornada" ? standingRows.length > 0 : season.ok && season.rows.length > 0;

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
      return;
    }
    void document.documentElement.requestFullscreen?.();
  };

  const selectRound = (item: FlexRoundNavItem) => {
    if (!item.hasPartidos) return;
    setHistoryRound(item.ronda === focusRound ? null : item.ronda);
  };

  return (
    <div className={`flex-pub-live${fullscreen ? " is-fullscreen" : ""}`}>
      <header className="flex-pub-live__header">
        <PublicEventBrandIdentity className="flex-pub-live__brand" />
        <div className="flex-pub-live__titles">
          <p className="flex-pub-live__club">
            {club || "Club"}
            <span> · by Riviera Open</span>
          </p>
          <h1 className="flex-pub-live__league">
            {leagueName}
            <span> — Jornada {pad(jornadaNumero)}</span>
          </h1>
          <p className="flex-pub-live__when">
            <span>
              {fecha}
              {horario ? ` · ${horario}` : ""}
            </span>
            <span className="flex-pub-live__status">{statusLabel}</span>
          </p>
        </div>
        <button
          type="button"
          className="flex-pub-live__expand"
          aria-label={fullscreen ? "Salir de pantalla completa" : "Expandir a pantalla completa"}
          title={fullscreen ? "Salir" : "Expandir"}
          onClick={toggleFullscreen}
        >
          {fullscreen ? <CollapseIcon /> : <ExpandIcon />}
        </button>
      </header>

      {dataStale ? (
        <p className="flex-pub-live__reconnect" role="status">
          Reconectando datos…
        </p>
      ) : null}

      <section className="flex-pub-live__progress" aria-label="Progreso de rondas">
        {totalRounds > 0 && focusRound != null ? (
          <div className="flex-pub-live__progress-copy">
            <p className="flex-pub-live__progress-now">
              Ronda {pad(focusRound)} de {pad(totalRounds)}
            </p>
            <p className="flex-pub-live__progress-left">
              {remaining === 1 ? "1 ronda por disputar" : `${remaining} rondas por disputar`}
            </p>
          </div>
        ) : (
          <div className="flex-pub-live__progress-copy">
            <p className="flex-pub-live__progress-now">Programación</p>
            <p className="flex-pub-live__progress-left">
              {totalRounds > 0
                ? `${totalRounds} rondas por disputar`
                : "Sin rondas configuradas"}
            </p>
          </div>
        )}
        {rounds.length > 0 ? (
          <div className="flex-pub-live__rounds-scroll">
            <div className="flex-pub-live__rounds" role="tablist" aria-label="Rondas">
              {rounds.map((item) => {
                const selected = item.ronda === visibleRound;
                return (
                  <button
                    key={item.ronda}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    disabled={!item.hasPartidos}
                    className={`flex-pub-live__round is-${item.estado}${selected ? " is-selected" : ""}`}
                    onClick={() => selectRound(item)}
                  >
                    <span aria-hidden>{roundMark(item.estado)}</span>
                    Ronda {pad(item.ronda)}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        {viewingHistory ? (
          <button type="button" className="flex-pub-live__back-live" onClick={() => setHistoryRound(null)}>
            Volver a ronda actual
          </button>
        ) : null}
      </section>

      <section className="flex-pub-live__matches" aria-label="Enfrentamientos">
        {partidos.length === 0 ? (
          <p className="flex-pub-live__empty">Esperando programación de la jornada</p>
        ) : visibleMatches.length === 0 ? (
          <p className="flex-pub-live__empty">Esta ronda todavía no está programada</p>
        ) : (
          <>
            {visiblePending ? <p className="flex-pub-live__pending">Resultados pendientes</p> : null}
            <div className={`flex-pub-live__courts flex-pub-live__courts--${courtCols}`}>
              {visibleMatches.map((partido, index) => (
                <LiveMatch
                  key={partido.id}
                  partido={partido}
                  fallbackCourt={index + 1}
                  parejas={parejas}
                  names={names}
                  profiles={profiles}
                />
              ))}
            </div>
          </>
        )}
      </section>

      <section className="flex-pub-live__standings" aria-label="Clasificación">
        <header className="flex-pub-live__standings-head">
          <div>
            <h2>{board === "jornada" ? "Clasificación de la jornada" : "Clasificación general"}</h2>
            <p>
              {board === "general"
                ? season.ok
                  ? "Puntos de jornadas cerradas"
                  : season.ties.length > 0
                    ? "Empate oficial sin resolver"
                    : "Sin puntos oficiales de temporada"
                : hasConfirmed
                  ? official
                    ? "Resultados oficiales"
                    : "Provisional — resultados confirmados"
                  : "Todavía no hay puntuaciones confirmadas"}
            </p>
          </div>
          <div className="flex-pub-live__switch" role="tablist" aria-label="Tipo de clasificación">
            <button
              type="button"
              role="tab"
              aria-selected={board === "jornada"}
              className={board === "jornada" ? "is-on" : ""}
              onClick={() => setBoard("jornada")}
            >
              Jornada
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={board === "general"}
              className={board === "general" ? "is-on" : ""}
              onClick={() => setBoard("general")}
            >
              General
            </button>
          </div>
        </header>
        {convocados.length === 0 ? (
          <p className="flex-pub-live__empty">Todavía no hay jugadores convocados</p>
        ) : (
          <div className={`flex-pub-live__tables${rightRows.length > 0 ? " is-split" : ""}`}>
            <StandingsTable rows={leftRows} names={names} profiles={profiles} />
            {rightRows.length > 0 ? (
              <StandingsTable rows={rightRows} names={names} profiles={profiles} />
            ) : null}
          </div>
        )}
        {official ? (
          <a className="flex-pub-live__final" href={jornadaHref}>
            Ver resultado final
          </a>
        ) : null}
      </section>
    </div>
  );
};

function buildBoard(convocados: string[], standingRows: FlexJornadaStandingRow[]): BoardRow[] {
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
      ordered.push({ jugadorId: id, posicion: null, puntos: null, count: null });
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
    <table className="flex-pub-live__table">
      <thead>
        <tr>
          <th>Pos</th>
          <th>Jugador</th>
          <th>PJ</th>
          <th>Pts</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const name = names.get(row.jugadorId) ?? "Jugador";
          const top = row.posicion != null && row.posicion <= 3;
          return (
            <tr key={row.jugadorId} className={top ? "is-top" : undefined}>
              <td className="is-pos">{row.posicion ?? "—"}</td>
              <td>
                <span className="flex-pub-live__player">
                  <FlexNeutralAvatar
                    name={name}
                    fotoUrl={profiles[row.jugadorId]?.fotoUrl}
                    variant="table"
                  />
                  <span>{name}</span>
                </span>
              </td>
              <td>{row.count != null && row.count > 0 ? row.count : "—"}</td>
              <td className="is-pts">{row.puntos != null ? row.puntos : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function LiveMatch({
  partido,
  fallbackCourt,
  parejas,
  names,
  profiles,
}: {
  partido: LigaPartido;
  fallbackCourt: number;
  parejas: LigaJornadaPareja[];
  names: Map<string, string>;
  profiles: Record<string, PublicProfile>;
}) {
  const byId = new Map(parejas.map((pareja) => [pareja.id, pareja]));
  const left = partido.pareja1 ?? byId.get(partido.pareja1_id);
  const right = partido.pareja2 ?? byId.get(partido.pareja2_id);
  const pairA = side(left, names, profiles);
  const pairB = side(right, names, profiles);
  const hasScore = partido.score_pareja1 != null && partido.score_pareja2 != null;
  const court =
    typeof partido.cancha === "number" && Number.isFinite(partido.cancha)
      ? partido.cancha
      : fallbackCourt;
  const status = hasScore ? "Final" : partido.estado === "in_progress" ? "En juego" : "Pendiente";

  return (
    <article className="flex-pub-live-match">
      <header>
        <span>Cancha {pad(court)}</span>
        <span>{status}</span>
      </header>
      <div className="flex-pub-live-match__body">
        <PairSide players={pairA} profiles={profiles} />
        <span className="flex-pub-live-match__vs">VS</span>
        <PairSide players={pairB} profiles={profiles} />
      </div>
      {hasScore ? (
        <p className="flex-pub-live-match__score">
          <span>{partido.score_pareja1}</span>
          <span>—</span>
          <span>{partido.score_pareja2}</span>
        </p>
      ) : null}
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
      {players.map((player) => (
        <div key={player.id || player.name} className="flex-pub-live-match__player">
          <FlexNeutralAvatar
            name={player.name}
            fotoUrl={player.foto ?? profiles[player.id]?.fotoUrl}
            variant="match"
          />
          <span>{player.name}</span>
        </div>
      ))}
    </div>
  );
}
