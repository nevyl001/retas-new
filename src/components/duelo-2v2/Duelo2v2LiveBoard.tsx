import React from "react";
import { JugadorAvatar } from "../jugadores/JugadorAvatar";
import { PublicRivieraCelebrateBrand } from "../public/PublicRivieraCelebrateBrand";
import type { Duelo2v2 } from "../../lib/duelo2v2/types";
import { getDueloPublicStatus } from "../../lib/duelo2v2/schedule";
import { Duelo2v2TeamSetResults } from "./Duelo2v2TeamSetResults";
import { Duelo2v2MatchMeta } from "./Duelo2v2MatchMeta";

export interface DueloPlayerView {
  id: string | null;
  nombre: string;
  fotoUrl?: string | null;
}

interface Duelo2v2LiveBoardProps {
  duelo: Duelo2v2;
  teamA: [DueloPlayerView, DueloPlayerView];
  teamB: [DueloPlayerView, DueloPlayerView];
  showBrand?: boolean;
  clockNow?: Date;
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
  clockNow,
}) => {
  const ganadorA = duelo.ganador === "a";
  const ganadorB = duelo.ganador === "b";
  const tieneGanador = Boolean(duelo.ganador);
  const status = getDueloPublicStatus(duelo, clockNow);

  return (
    <section className="duelo2v2-live-board" aria-label="Encuentro 2 vs 2">
      {showBrand && (
        <div className="duelo2v2-live-board__brand">
          <PublicRivieraCelebrateBrand showTagline />
        </div>
      )}

      <header className="duelo2v2-live-board__header">
        <h1 className="duelo2v2-live-board__title">{duelo.nombre}</h1>
        <p className="duelo2v2-live-board__sub">
          Duelo 2 vs 2 · Riviera Open
          {status ? (
            <span className={STATUS_CLASS[status.tone]}> · {status.label}</span>
          ) : null}
        </p>
        <Duelo2v2MatchMeta duelo={duelo} className="duelo2v2-live-board__meta" />
      </header>

      <div className="duelo2v2-live-board__arena">
        <div
          className={`duelo2v2-live-team${ganadorA ? " duelo2v2-live-team--winner" : ""}`}
        >
          <p className="duelo2v2-live-team__label">Pareja 1</p>
          <div className="duelo2v2-live-team__avatars">
            {teamA.map((p) => (
              <div key={p.nombre} className="duelo2v2-live-player">
                <div className="duelo2v2-live-player__ring">
                  <JugadorAvatar
                    fotoUrl={p.fotoUrl}
                    nombre={p.nombre}
                    size="xl"
                    className="duelo2v2-live-player__avatar"
                  />
                </div>
                <span className="duelo2v2-live-player__name">{p.nombre}</span>
              </div>
            ))}
          </div>

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
          className={`duelo2v2-live-team${ganadorB ? " duelo2v2-live-team--winner" : ""}`}
        >
          <p className="duelo2v2-live-team__label">Pareja 2</p>
          <div className="duelo2v2-live-team__avatars">
            {teamB.map((p) => (
              <div key={p.nombre} className="duelo2v2-live-player">
                <div className="duelo2v2-live-player__ring">
                  <JugadorAvatar
                    fotoUrl={p.fotoUrl}
                    nombre={p.nombre}
                    size="xl"
                    className="duelo2v2-live-player__avatar"
                  />
                </div>
                <span className="duelo2v2-live-player__name">{p.nombre}</span>
              </div>
            ))}
          </div>

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
