import React, { useMemo } from "react";
import { formatCanchaDisplay } from "../../../lib/torneoExpress/canchaDisplay";
import { sortPartidosByOrden } from "../../../lib/torneoExpress/roundRobin";
import type {
  TorneoExpressGrupoPareja,
  TorneoExpressPartido,
} from "../../../lib/torneoExpress/types";
import {
  TePubMatchOutcome,
  TePubMatchStatus,
  tePubScoreNumModifier,
} from "../../public/tePubShared";
import { useCountUp } from "./useCountUp";
import "../../public/riviera-public-americano.css";

function AnimatedScore({
  value,
  isWin,
  isTie,
  animate,
}: {
  value: number;
  isWin: boolean;
  isTie: boolean;
  animate: boolean;
}) {
  const displayed = useCountUp(value, { enabled: animate });
  return (
    <span
      className={`te-pub-score__num${tePubScoreNumModifier({ isWin, isTie })}`}
    >
      {displayed}
    </span>
  );
}

function TePublicMatchCard({
  partido,
  localLabel,
  visitLabel,
  enVivo,
  index,
}: {
  partido: TorneoExpressPartido;
  localLabel: string;
  visitLabel: string;
  enVivo: boolean;
  index: number;
}) {
  const played = partido.estado === "jugado";
  const pl = partido.puntos_local ?? 0;
  const pv = partido.puntos_visitante ?? 0;
  const localWins = played && pl > pv;
  const visitWins = played && pv > pl;
  const isTie = played && pl === pv;
  const winnerLabel = localWins
    ? localLabel
    : visitWins
      ? visitLabel
      : null;

  return (
    <article
      className="te-pub-match te-pub-fade-in-up"
      style={{ animationDelay: `${0.12 + index * 0.07}s` }}
    >
      <div className="te-pub-match__top">
        <TePubMatchStatus
          variant={played ? "played" : enVivo ? "live" : "pending"}
        />
        <span className="te-pub-cancha" title="Cancha">
          <span className="te-pub-cancha__icon" aria-hidden>
            🎾
          </span>
          {formatCanchaDisplay(partido.cancha)}
        </span>
      </div>

      <div className="te-pub-match__score-block">
        {played ? (
          <div className="te-pub-score">
            <AnimatedScore
              value={pl}
              isWin={localWins}
              isTie={isTie}
              animate={played}
            />
            <span className="te-pub-score__sep">—</span>
            <AnimatedScore
              value={pv}
              isWin={visitWins}
              isTie={isTie}
              animate={played}
            />
          </div>
        ) : (
          <span className="te-pub-score te-pub-score--pending">—</span>
        )}
      </div>

      <div className="te-pub-match__teams">
        <span
          className={`te-pub-match__team${
            localWins ? " te-pub-match__team--win" : ""
          }`}
        >
          {localLabel}
        </span>
        <span className="te-pub-match__vs">vs</span>
        <span
          className={`te-pub-match__team${
            visitWins ? " te-pub-match__team--win" : ""
          }`}
        >
          {visitLabel}
        </span>
      </div>

      <TePubMatchOutcome winnerLabel={winnerLabel} isTie={isTie} />
    </article>
  );
}

export const PublicPartidosByRoundSection: React.FC<{
  partidos: TorneoExpressPartido[];
  parejas: TorneoExpressGrupoPareja[];
  grupoLabel?: string;
  title?: string;
}> = ({ partidos, parejas, grupoLabel, title = "Partidos por ronda" }) => {
  const sorted = useMemo(() => sortPartidosByOrden(partidos), [partidos]);

  const labelById = useMemo(() => {
    const m = new Map<string, string>();
    parejas.forEach((p) =>
      m.set(p.pareja_id, p.pareja_display ?? p.pareja_id)
    );
    return m;
  }, [parejas]);

  const enVivoId = useMemo(() => {
    const first = sorted.find((p) => p.estado === "pendiente");
    return first?.id ?? null;
  }, [sorted]);

  const byRound = useMemo(() => {
    const map = new Map<number, TorneoExpressPartido[]>();
    sorted.forEach((p) => {
      const r = p.ronda ?? 1;
      const list = map.get(r) ?? [];
      list.push(p);
      map.set(r, list);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [sorted]);

  if (sorted.length === 0) {
    return (
      <section className="te-public-section te-pub-fade-in te-pub-fade-in--delay-2">
        <h2 className="te-public-section__title">{title}</h2>
        <p className="te-public-empty">Sin partidos programados.</p>
      </section>
    );
  }

  return (
    <section className="te-public-section te-pub-fade-in te-pub-fade-in--delay-2">
      <h2 className="te-public-section__title">{title}</h2>
      <div className="te-public-section__divider" aria-hidden />

      {byRound.map(([ronda, roundPartidos], roundIdx) => {
        const roundHasLive = roundPartidos.some(
          (p) => p.estado === "pendiente" && p.id === enVivoId
        );
        const roundInProgress = roundPartidos.some(
          (p) => p.estado === "pendiente"
        );

        return (
          <div
            key={ronda}
            className="te-public-round-block"
            style={{ animationDelay: `${0.05 + roundIdx * 0.06}s` }}
          >
            <div className="te-public-round-head">
              <h3 className="te-public-round-head__title">
                <span className="te-public-round-head__num">Ronda {ronda}</span>
                {grupoLabel ? (
                  <>
                    <span className="te-public-round-head__sep">·</span>
                    <span className="te-public-round-head__phase">
                      {grupoLabel}
                    </span>
                  </>
                ) : null}
                {roundInProgress && roundHasLive && (
                  <span className="te-public-round-head__live">
                    <span className="te-pub-status__dot" aria-hidden />
                    en curso
                  </span>
                )}
              </h3>
            </div>

            <div className="te-pub-matches-grid">
              {roundPartidos.map((partido, index) => (
                <TePublicMatchCard
                  key={partido.id}
                  partido={partido}
                  localLabel={labelById.get(partido.pareja_local_id) ?? "Local"}
                  visitLabel={
                    labelById.get(partido.pareja_visitante_id) ?? "Visitante"
                  }
                  enVivo={partido.id === enVivoId}
                  index={index}
                />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
};
