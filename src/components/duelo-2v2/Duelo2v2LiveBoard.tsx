import React from "react";
import { useOrganizerDisplayName } from "../../club-experience";
import { PublicRivieraCelebrateBrand } from "../public/PublicRivieraCelebrateBrand";
import { PublicSplitVsPairHalf } from "../public/split-vs";
import type { Duelo2v2 } from "../../lib/duelo2v2/types";
import { getDueloPublicStatus } from "../../lib/duelo2v2/schedule";
import { Duelo2v2TeamSetResults } from "./Duelo2v2TeamSetResults";
import { Duelo2v2MatchMeta } from "./Duelo2v2MatchMeta";

export interface DueloPlayerView {
  id: string | null;
  nombre: string;
  fotoUrl?: string | null;
  rating?: number | null;
}

interface Duelo2v2LiveBoardProps {
  duelo: Duelo2v2;
  teamA: [DueloPlayerView, DueloPlayerView];
  teamB: [DueloPlayerView, DueloPlayerView];
  showBrand?: boolean;
  /** Oculta marca Riviera y header interno cuando el hero vive en el padre (PEDS). */
  hidePublicHeader?: boolean;
  clockNow?: Date;
  className?: string;
}

const STATUS_CLASS: Record<
  NonNullable<ReturnType<typeof getDueloPublicStatus>>["tone"],
  string
> = {
  live: "duelo2v2-live-dot",
  upcoming: "duelo2v2-live-board__upcoming",
  muted: "duelo2v2-live-board__muted",
  done: "duelo2v2-live-board__done",
};

export const Duelo2v2LiveBoard: React.FC<Duelo2v2LiveBoardProps> = ({
  duelo,
  teamA,
  teamB,
  showBrand = true,
  hidePublicHeader = false,
  clockNow,
  className,
}) => {
  const ganadorA = duelo.ganador === "a";
  const ganadorB = duelo.ganador === "b";
  const tieneGanador = Boolean(duelo.ganador);
  const status = getDueloPublicStatus(duelo, clockNow);
  const organizerName = useOrganizerDisplayName();
  const brandLine = organizerName;
  const toneA = ganadorA ? "win" : tieneGanador ? "loss" : "neutral";
  const toneB = ganadorB ? "win" : tieneGanador ? "loss" : "neutral";

  return (
    <section
      className={`duelo2v2-live-board duelo2v2-live-board--split-vs${className ? ` ${className}` : ""}`}
      aria-label="Encuentro 2 vs 2"
    >
      {!hidePublicHeader && showBrand ? (
        <div className="duelo2v2-live-board__brand">
          <PublicRivieraCelebrateBrand showTagline />
        </div>
      ) : null}

      {!hidePublicHeader ? (
        <header className="duelo2v2-live-board__header">
          <h1 className="duelo2v2-live-board__title">{duelo.nombre}</h1>
          <p className="duelo2v2-live-board__sub">
            Duelo 2 vs 2 · {brandLine}
            {status ? (
              <span className={STATUS_CLASS[status.tone]}> · {status.label}</span>
            ) : null}
          </p>
          <Duelo2v2MatchMeta
            duelo={duelo}
            clubName={organizerName}
            className="duelo2v2-live-board__meta"
          />
        </header>
      ) : null}

      <div className="duelo2v2-live-board__arena duelo2v2-live-board__arena--split-vs">
        <div
          className={`duelo2v2-live-team duelo2v2-live-team--split-vs${ganadorA ? " duelo2v2-live-team--winner" : ""}`}
        >
          <p className="duelo2v2-live-team__label">Pareja 1</p>
          <PublicSplitVsPairHalf
            player1={{ name: teamA[0].nombre, foto: teamA[0].fotoUrl }}
            player2={{ name: teamA[1].nombre, foto: teamA[1].fotoUrl }}
            label={`${teamA[0].nombre} / ${teamA[1].nombre}`}
            tone={toneA}
            showWinnerBadge={ganadorA}
          />

          <Duelo2v2TeamSetResults detalle={duelo.detalle_sets} side="a" />

          <div className="duelo2v2-live-team__score">
            {duelo.sets_pareja_a}
            <span className="duelo2v2-live-team__score-label">sets</span>
          </div>
        </div>

        <div className="duelo2v2-live-board__center" aria-hidden="true">
          <span className="duelo2v2-live-board__vs">VS</span>
          {tieneGanador ? (
            <span className="duelo2v2-live-board__winner-badge duelo2v2-live-board__winner-badge--desktop">
              ¡Ganadores!
            </span>
          ) : null}
        </div>

        <div
          className={`duelo2v2-live-team duelo2v2-live-team--split-vs${ganadorB ? " duelo2v2-live-team--winner" : ""}`}
        >
          <p className="duelo2v2-live-team__label">Pareja 2</p>
          <PublicSplitVsPairHalf
            player1={{ name: teamB[0].nombre, foto: teamB[0].fotoUrl }}
            player2={{ name: teamB[1].nombre, foto: teamB[1].fotoUrl }}
            label={`${teamB[0].nombre} / ${teamB[1].nombre}`}
            tone={toneB}
            showWinnerBadge={ganadorB}
          />

          <Duelo2v2TeamSetResults detalle={duelo.detalle_sets} side="b" />

          <div className="duelo2v2-live-team__score">
            {duelo.sets_pareja_b}
            <span className="duelo2v2-live-team__score-label">sets</span>
          </div>
        </div>
      </div>
    </section>
  );
};
