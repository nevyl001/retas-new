import React from "react";
import {
  getPartidoSets,
  matchWinnerSideFromPartido,
} from "../../lib/torneoExpress/partidoSets";
import type { PartidoSetScore } from "../../lib/torneoExpress/types";
import type { PartidoSetsSide } from "../../lib/torneoExpress/partidoSets";

export type PartidoSetsScoreVariant =
  | "inline"
  | "single-large"
  | "pills-column"
  | "cuadro-plain";

export interface PartidoSetsScoreDisplayProps {
  sets?: PartidoSetScore[];
  winnerSide?: PartidoSetsSide | null;
  variant: PartidoSetsScoreVariant;
  className?: string;
  /** Partido completo — alternativa a sets + winnerSide. */
  partido?: {
    sets_resultado?: unknown;
    puntos_local?: number | null;
    puntos_visitante?: number | null;
    ganador_id?: string | null;
    pareja_local_id?: string | null;
    pareja_visitante_id?: string | null;
    estado?: string;
  };
}

function SetGameNums({
  set,
  winnerSide,
  variant,
}: {
  set: PartidoSetScore;
  winnerSide: PartidoSetsSide | null;
  variant: PartidoSetsScoreVariant;
}) {
  const setSide = set.local > set.visitante ? "local" : set.visitante > set.local ? "visitante" : null;
  const localWin =
    setSide === "local" ? " te-set-game--win" : setSide === "visitante" ? " te-set-game--lose" : "";
  const visitWin =
    setSide === "visitante" ? " te-set-game--win" : setSide === "local" ? " te-set-game--lose" : "";

  if (variant === "single-large") {
    return (
      <>
        <span className={`te-set-game${localWin}`}>{set.local}</span>
        <span className="te-set-game-sep" aria-hidden>
          —
        </span>
        <span className={`te-set-game${visitWin}`}>{set.visitante}</span>
      </>
    );
  }

  if (variant === "cuadro-plain") {
    return (
      <>
        <span className="te-set-game te-set-game--cuadro">{set.local}</span>
        <span className="te-set-game-sep" aria-hidden>
          –
        </span>
        <span className="te-set-game te-set-game--cuadro">{set.visitante}</span>
      </>
    );
  }

  return (
    <>
      <span className={`te-set-game${localWin}`}>{set.local}</span>
      <span className="te-set-game-sep" aria-hidden>
        –
      </span>
      <span className={`te-set-game${visitWin}`}>{set.visitante}</span>
    </>
  );
}

export const PartidoSetsScoreDisplay: React.FC<PartidoSetsScoreDisplayProps> = ({
  sets: setsProp,
  winnerSide: winnerSideProp,
  variant,
  className = "",
  partido,
}) => {
  const sets = setsProp ?? (partido ? getPartidoSets(partido) : []);
  const winnerSide =
    winnerSideProp ??
    (partido ? matchWinnerSideFromPartido(partido) : null);

  if (sets.length === 0 || (sets.length === 1 && sets[0].local === 0 && sets[0].visitante === 0 && !partido?.estado)) {
    return null;
  }

  if (variant === "single-large" || (variant === "inline" && sets.length === 1)) {
    const s = sets[0];
    const rootClass =
      variant === "single-large" || sets.length === 1
        ? "te-partido-sets-score te-partido-sets-score--large te-partido-score-center"
        : "te-partido-sets-score te-partido-sets-score--inline te-partido-sets-score--single";
    return (
      <span className={`${rootClass} ${className}`.trim()} aria-label="Marcador">
        <SetGameNums set={s} winnerSide={winnerSide} variant="single-large" />
      </span>
    );
  }

  if (variant === "pills-column") {
    return (
      <div
        className={`te-partido-sets-score te-partido-sets-score--pills-col ${className}`.trim()}
        aria-label="Marcador por sets"
      >
        {sets.map((s, i) => {
          const setWonByMatchWinner =
            winnerSide === "local"
              ? s.local > s.visitante
              : winnerSide === "visitante"
                ? s.visitante > s.local
                : s.local > s.visitante;
          return (
            <span
              key={i}
              className={`te-set-pill${
                setWonByMatchWinner
                  ? " te-set-pill--match-won"
                  : " te-set-pill--match-lost"
              }`}
            >
              <SetGameNums set={s} winnerSide={winnerSide} variant="inline" />
            </span>
          );
        })}
      </div>
    );
  }

  if (variant === "cuadro-plain") {
    return (
      <span
        className={`te-partido-sets-score te-partido-sets-score--cuadro ${className}`.trim()}
        aria-label="Marcador"
      >
        {sets.map((s, i) => (
          <React.Fragment key={i}>
            {i > 0 ? (
              <span className="te-partido-sets-score__slash" aria-hidden>
                {" / "}
              </span>
            ) : null}
            <SetGameNums set={s} winnerSide={winnerSide} variant="cuadro-plain" />
          </React.Fragment>
        ))}
      </span>
    );
  }

  return (
    <span
      className={`te-partido-sets-score te-partido-sets-score--inline ${className}`.trim()}
      aria-label="Marcador por sets"
    >
      {sets.map((s, i) => (
        <React.Fragment key={i}>
          {i > 0 ? (
            <span className="te-partido-sets-score__slash" aria-hidden>
              {" / "}
            </span>
          ) : null}
          <span className="te-set-chip">
            <SetGameNums set={s} winnerSide={winnerSide} variant="inline" />
          </span>
        </React.Fragment>
      ))}
    </span>
  );
};
