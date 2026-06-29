import React from "react";
import { JugadorAvatar } from "../jugadores/JugadorAvatar";
import "../jugadores/riviera-jugadores.css";
import {
  PublicRivieraCelebrateBrand,
  PublicRivieraCelebrateClosing,
} from "../public/PublicRivieraCelebrateBrand";
import { PublicRivieraSocialBar } from "../public/PublicRivieraSocialBar";
import type { PublicRetaWinnerAvatar } from "../public/PublicRetaWinnerSection";
import "../../styles/riviera-public-celebrate.css";
import "../duelo-2v2/duelo2v2-page.css";
import "./reta-rr-winner-celebrate.css";

export type RetaWinnerStat = {
  value: string | number;
  label: string;
};

export const RetaRoundRobinWinnerCelebrate: React.FC<{
  pairLabel: string;
  torneoNombre?: string;
  rankLabel?: string;
  fraseMotivacional?: string;
  stats?: RetaWinnerStat[];
  winners?: PublicRetaWinnerAvatar[];
  className?: string;
}> = ({
  pairLabel,
  torneoNombre,
  rankLabel = "Ganadores de la reta",
  fraseMotivacional = "¡Ganadores de la reta! Compartan su victoria en redes y sigan dominando la cancha.",
  stats,
  winners,
  className = "",
}) => {
  const hasWinners = Boolean(winners && winners.length > 0);

  return (
    <section
      id="reta-winner-celebrate"
      className={`reta-rr-celebrate duelo2v2-celebrate ro-pub-celebrate ro-pub-celebrate--winners te-pub-fade-in ${className}`.trim()}
      aria-label="Ganadores de la reta Round Robin"
    >
      <div
        className="ro-pub-celebrate__glow reta-rr-celebrate__desktop-only"
        aria-hidden
      />
      <div className="ro-pub-celebrate__inner">
        <div className="reta-rr-celebrate__desktop-only">
          <PublicRivieraCelebrateBrand showTagline={false} />
        </div>

        <article className="duelo2v2-celebrate__team-card duelo2v2-celebrate__team-card--winner reta-rr-celebrate__card">
          <p className="duelo2v2-celebrate__team-card-badge">Ganadores</p>
          <h2 className="duelo2v2-celebrate__team-card-headline">¡Felicidades!</h2>
          <p className="duelo2v2-celebrate__team-card-names">{pairLabel}</p>

          {hasWinners ? (
            <div className="duelo2v2-celebrate__pair-players reta-rr-celebrate__players">
              {winners!.map((w) => (
                <div key={w.jugadorId ?? w.name} className="duelo2v2-celebrate__player">
                  <div className="duelo2v2-celebrate__player-ring duelo2v2-celebrate__player-ring--winner">
                    <JugadorAvatar
                      fotoUrl={w.fotoUrl}
                      nombre={w.name}
                      size="xl"
                      className="duelo2v2-celebrate__player-avatar"
                    />
                  </div>
                  <span className="duelo2v2-celebrate__player-name">{w.name}</span>
                </div>
              ))}
            </div>
          ) : null}

          <p className="reta-rr-celebrate__rank">{rankLabel}</p>

          {stats && stats.length > 0 ? (
            <div className="reta-rr-celebrate__stats" role="list">
              {stats.map((s) => (
                <div key={s.label} className="reta-rr-celebrate__stat" role="listitem">
                  <span className="reta-rr-celebrate__stat-value">{s.value}</span>
                  <span className="reta-rr-celebrate__stat-label">{s.label}</span>
                </div>
              ))}
            </div>
          ) : null}

          <p className="duelo2v2-celebrate__team-card-message duelo2v2-celebrate__team-card-message--winner">
            {fraseMotivacional}
          </p>

          {torneoNombre ? (
            <p className="reta-rr-celebrate__torneo-mobile">{torneoNombre}</p>
          ) : null}
        </article>

        <div className="reta-rr-celebrate__desktop-only">
          <PublicRivieraCelebrateClosing torneoNombre={torneoNombre} />
          <PublicRivieraSocialBar
            compact
            className="reta-rr-celebrate__social"
          />
        </div>
      </div>
    </section>
  );
};

export default RetaRoundRobinWinnerCelebrate;
