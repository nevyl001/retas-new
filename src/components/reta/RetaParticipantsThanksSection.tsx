import React from "react";
import type { PublicRetaPairPlayer } from "../public/PublicRetaPairSide";
import { PublicRivieraSocialBar } from "../public/PublicRivieraSocialBar";
import "../torneo-express/public/te-public-podium-card.css";
import "./reta-participants-thanks.css";

export interface RetaThanksParticipant {
  pairId: string;
  position: number;
  players: PublicRetaPairPlayer[];
  pairLabel: string;
}

const THANKS_COPY = {
  badge: "PARTICIPANTES",
  title: "¡Gracias por participar!",
  message: "Sigan jugando, sigan sumando puntos a su ranking Riviera Open.",
};

function ThanksAvatar({ player }: { player: PublicRetaPairPlayer }) {
  const initial = (player.name.trim()[0] ?? "?").toUpperCase();
  return (
    <span className="reta-thanks__avatar">
      {player.fotoUrl ? (
        <img
          className="reta-thanks__avatar-img"
          src={player.fotoUrl}
          alt=""
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="reta-thanks__avatar-initial" aria-hidden>
          {initial}
        </span>
      )}
    </span>
  );
}

function pairNames(participant: RetaThanksParticipant): string {
  const names = participant.players
    .slice(0, 2)
    .map((p) => p.name.trim())
    .filter(Boolean);
  if (names.length >= 2) return `${names[0]} / ${names[1]}`;
  return participant.pairLabel;
}

/**
 * Tarjeta compartible que agrupa a TODOS los participantes no ganadores de una
 * reta (Round Robin / Remontada Final, solo parejas). Reutiliza el lenguaje
 * visual de la tarjeta de ganadores (marco de esquinas, dorado/negro, branding
 * y redes). Mobile-first: el roster se adapta a 4, 6, 8+ parejas.
 */
export const RetaParticipantsThanksSection: React.FC<{
  participants: RetaThanksParticipant[];
  torneoNombre?: string;
  className?: string;
}> = ({ participants, torneoNombre, className = "" }) => {
  if (participants.length === 0) return null;

  const density =
    participants.length > 8
      ? "xdense"
      : participants.length > 5
        ? "dense"
        : "cozy";

  return (
    <div className={`reta-thanks-wrap ${className}`.trim()}>
      <section
        className="podium-card reta-thanks te-pub-fade-in"
        data-density={density}
        aria-label="Gracias por participar"
      >
        <span className="podium-card__corner podium-card__corner--tl" aria-hidden />
        <span className="podium-card__corner podium-card__corner--tr" aria-hidden />
        <span className="podium-card__corner podium-card__corner--bl" aria-hidden />
        <span className="podium-card__corner podium-card__corner--br" aria-hidden />

        <div className="podium-card__inner reta-thanks__inner">
          {torneoNombre ? (
            <p className="podium-card__torneo-name">{torneoNombre}</p>
          ) : null}
          <div className="podium-card__gold-line" aria-hidden />
          <p className="podium-card__badge reta-thanks__badge">
            {THANKS_COPY.badge}
          </p>
          <h2 className="podium-card__title reta-thanks__title">
            {THANKS_COPY.title}
          </h2>
          <p className="podium-card__quote reta-thanks__message">
            {THANKS_COPY.message}
          </p>

          <ul className="reta-thanks__grid" aria-label="Clasificación final">
            {participants.map((participant) => (
              <li key={participant.pairId} className="reta-thanks__item">
                <span className="reta-thanks__pos">#{participant.position}</span>
                <span className="reta-thanks__avatars">
                  {participant.players.slice(0, 2).map((player, idx) => (
                    <ThanksAvatar
                      key={player.id ?? `${participant.pairId}-${idx}`}
                      player={player}
                    />
                  ))}
                </span>
                <p className="reta-thanks__names">{pairNames(participant)}</p>
              </li>
            ))}
          </ul>

          <div className="podium-card__footer-divider" aria-hidden />

          <footer className="podium-card__footer">
            {torneoNombre ? (
              <p className="podium-card__footer-torneo">{torneoNombre}</p>
            ) : null}
            <p className="podium-card__footer-tagline">Vive Riviera Open</p>
            <PublicRivieraSocialBar compact className="podium-card__social" />
          </footer>
        </div>
      </section>
    </div>
  );
};

export default RetaParticipantsThanksSection;
