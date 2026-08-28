import React from "react";
import {
  getPartidoPublicScoreboard,
  type JornadaPublicMatch,
  type PartidoPublicScoreboard,
} from "../../lib/liga/publicDisplay";
import type { LigaPartido } from "../../lib/liga/types";

function formatJornadaFecha(fecha: string | null | undefined): string | null {
  if (!fecha) return null;
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}/${fecha.slice(0, 4)}`;
}

function splitPairLabel(label: string): { p1: string; p2: string } {
  const sep = " / ";
  const idx = label.indexOf(sep);
  if (idx === -1) return { p1: label.trim(), p2: "" };
  return {
    p1: label.slice(0, idx).trim(),
    p2: label.slice(idx + sep.length).trim(),
  };
}

type SetCell = { score: string; isWon: boolean };

function teamSetCells(
  board: PartidoPublicScoreboard,
  side: 1 | 2
): SetCell[] | null {
  if (board.kind === "board") {
    return board.columns.map((col) => {
      const mine = side === 1 ? col.p1 : col.p2;
      const theirs = side === 1 ? col.p2 : col.p1;
      return {
        score: String(mine),
        isWon: mine > theirs,
      };
    });
  }
  if (board.kind === "simple") {
    const mine = side === 1 ? board.s1 : board.s2;
    const theirs = side === 1 ? board.s2 : board.s1;
    return [{ score: String(mine), isWon: mine > theirs }];
  }
  return null;
}

function renderPairNames(
  label: string,
  win: boolean
): React.ReactNode {
  const { p1, p2 } = splitPairLabel(label);
  const nameClass = win
    ? "liga-pub-programa-match__name liga-pub-programa-match__name--win"
    : "liga-pub-programa-match__name";

  if (!p2) {
    return <span className={nameClass}>{p1}</span>;
  }

  return (
    <span className={nameClass}>
      {p1}
      <span className="liga-pub-programa-match__name-sep"> / </span>
      {p2}
    </span>
  );
}

function renderSetCells(
  cells: SetCell[] | null,
  pending: boolean
): React.ReactNode {
  if (pending || !cells?.length) {
    return (
      <span className="liga-pub-programa-match__set liga-pub-programa-match__set--pending">
        —
      </span>
    );
  }

  return cells.map((cell, index) => (
    <span
      key={index}
      className={`liga-pub-programa-match__set${
        cell.isWon ? " liga-pub-programa-match__set--won" : ""
      }`}
    >
      {cell.score}
    </span>
  ));
}

interface LigaPubProgramaMatchCardProps {
  match: JornadaPublicMatch;
  partido?: LigaPartido;
  esParejasFijas: boolean;
  jornadaFecha?: string | null;
  matchIndex: number;
}

/** Tarjeta de partido — layout en filas (marcador broadcast) para programa público. */
export const LigaPubProgramaMatchCard: React.FC<LigaPubProgramaMatchCardProps> = ({
  match,
  partido,
  esParejasFijas,
  jornadaFecha,
  matchIndex,
}) => {
  const board = partido
    ? getPartidoPublicScoreboard(partido, esParejasFijas)
    : ({ kind: "pending" } as PartidoPublicScoreboard);

  const pending = board.kind === "pending";
  const isWo = board.kind === "wo";
  const isLive = partido?.estado === "in_progress";
  const team1Win = match.winnerSide === 1;
  const team2Win = match.winnerSide === 2;
  const sets1 = teamSetCells(board, 1);
  const sets2 = teamSetCells(board, 2);

  const canchaLabel =
    partido?.cancha != null ? `Cancha ${partido.cancha}` : "Cancha";
  const dateLabel =
    formatJornadaFecha(jornadaFecha) ??
    (match.programacion?.includes("·")
      ? match.programacion.split("·").pop()?.trim() ?? null
      : null);

  return (
    <li
      className="liga-pub-programa-match liga-pub-programa-match--animated"
      style={{ ["--liga-match-i" as string]: matchIndex } as React.CSSProperties}
    >
      <header className="liga-pub-programa-match__head">
        <div className="liga-pub-programa-match__head-left">
          <span
            className={`liga-pub-programa-match__live-dot${
              isLive ? " liga-pub-programa-match__live-dot--pulse" : ""
            }`}
            aria-hidden
          />
          <span className="liga-pub-programa-match__cancha">{canchaLabel}</span>
        </div>
        {dateLabel ? (
          <span className="liga-pub-programa-match__date">{dateLabel}</span>
        ) : null}
      </header>

      {isWo ? (
        <p className="liga-pub-programa-match__wo" role="status">
          Walkover
        </p>
      ) : null}

      <div className="liga-pub-programa-match__teams">
        {match.local ? (
          <div
            className={`liga-pub-programa-match__row${
              team1Win
                ? " liga-pub-programa-match__row--win"
                : team2Win
                  ? " liga-pub-programa-match__row--loss"
                  : ""
            }`}
          >
            <div className="liga-pub-programa-match__names">
              {team1Win ? (
                <span className="liga-pub-programa-match__crown" aria-hidden>
                  ★
                </span>
              ) : null}
              {renderPairNames(match.local, team1Win)}
            </div>
            <div className="liga-pub-programa-match__sets" aria-label="Parciales">
              {renderSetCells(sets1, pending)}
            </div>
          </div>
        ) : null}

        {match.visitante ? (
          <div
            className={`liga-pub-programa-match__row${
              team2Win
                ? " liga-pub-programa-match__row--win"
                : team1Win
                  ? " liga-pub-programa-match__row--loss"
                  : ""
            }`}
          >
            <div className="liga-pub-programa-match__names">
              {team2Win ? (
                <span className="liga-pub-programa-match__crown" aria-hidden>
                  ★
                </span>
              ) : null}
              {renderPairNames(match.visitante, team2Win)}
            </div>
            <div className="liga-pub-programa-match__sets" aria-label="Parciales">
              {renderSetCells(sets2, pending)}
            </div>
          </div>
        ) : null}
      </div>

      {pending && !isWo ? (
        <p className="liga-pub-programa-match__pending">Por jugar</p>
      ) : null}
    </li>
  );
};
