import React, { useState } from "react";
import type { Duelo2v2SharePresentation } from "../../lib/duelo2v2/duelo2v2SharePresentation";
import { JugadorAvatar } from "../jugadores/JugadorAvatar";
import "./duelo2v2-share-card.css";

const RIVIERA_SOCIAL_PLATFORMS = "Instagram · Facebook · TikTok";
const RIVIERA_SOCIAL_HANDLE = "@RivieraOpen";

function RatingStat({ rating }: { rating?: number | null }) {
  if (rating == null || !Number.isFinite(rating)) {
    return null;
  }
  return (
    <span className="duelo2v2-share-card__rating">
      <span className="duelo2v2-share-card__rating-label">Rating</span>
      <span className="duelo2v2-share-card__rating-value">{rating.toFixed(2)}</span>
    </span>
  );
}

function RivieraSocialFooter() {
  return (
    <footer className="duelo2v2-share-card__social">
      <p className="duelo2v2-share-card__social-platforms">{RIVIERA_SOCIAL_PLATFORMS}</p>
      <p className="duelo2v2-share-card__social-handle">{RIVIERA_SOCIAL_HANDLE}</p>
    </footer>
  );
}

export function Duelo2v2ShareCard({
  presentation,
}: {
  presentation: Duelo2v2SharePresentation;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const isWinner = presentation.place === "winner";
  const [firstPlayer, secondPlayer] = presentation.players.slice(0, 2);

  return (
    <article
      className={`duelo2v2-share-card duelo2v2-share-card--${presentation.place}`}
      data-duelo-share-layout="story-9x16"
      aria-label={`${presentation.badge} · ${presentation.teamName}`}
    >
      <div className="duelo2v2-share-card__art">
        <header className="duelo2v2-share-card__top">
          <div className="duelo2v2-share-card__top-row">
            <div className="duelo2v2-share-card__brand">
              {presentation.clubLogoUrl && !logoFailed ? (
                <img
                  src={presentation.clubLogoUrl}
                  alt=""
                  className="duelo2v2-share-card__club-logo"
                  onError={() => setLogoFailed(true)}
                />
              ) : (
                <span className="duelo2v2-share-card__club-mark" aria-hidden>
                  {presentation.clubName.trim().slice(0, 1).toUpperCase()}
                </span>
              )}
              <div>
                <strong>{presentation.clubName}</strong>
                {presentation.showMotherAttribution ? (
                  <span>by Riviera Open</span>
                ) : null}
              </div>
            </div>
            <span className="duelo2v2-share-card__place-pill">
              {presentation.positionLabel}
            </span>
          </div>

          <div className="duelo2v2-share-card__context">
            <span>{presentation.dueloNombre}</span>
            <small>Duelo 2 vs 2</small>
          </div>
        </header>

        <div className="duelo2v2-share-card__hero">
          <p className="duelo2v2-share-card__badge">{presentation.badge}</p>
          <h2 className="duelo2v2-share-card__headline">{presentation.headline}</h2>

          <div className="duelo2v2-share-card__players" aria-label={presentation.teamName}>
            <div className="duelo2v2-share-card__player">
              {firstPlayer ? (
                <>
                  <span className="duelo2v2-share-card__avatar-frame">
                    <JugadorAvatar
                      fotoUrl={firstPlayer.fotoUrl}
                      nombre={firstPlayer.name}
                      size="xl"
                      loading="lazy"
                      alt={firstPlayer.fotoUrl ? `Foto de ${firstPlayer.name}` : ""}
                      className="duelo2v2-share-card__avatar"
                    />
                  </span>
                  <strong title={firstPlayer.name}>{firstPlayer.name}</strong>
                  <RatingStat rating={firstPlayer.rating} />
                </>
              ) : null}
            </div>

            <span className="duelo2v2-share-card__pair-axis" aria-hidden />

            <div className="duelo2v2-share-card__player">
              {secondPlayer ? (
                <>
                  <span className="duelo2v2-share-card__avatar-frame">
                    <JugadorAvatar
                      fotoUrl={secondPlayer.fotoUrl}
                      nombre={secondPlayer.name}
                      size="xl"
                      loading="lazy"
                      alt={secondPlayer.fotoUrl ? `Foto de ${secondPlayer.name}` : ""}
                      className="duelo2v2-share-card__avatar"
                    />
                  </span>
                  <strong title={secondPlayer.name}>{secondPlayer.name}</strong>
                  <RatingStat rating={secondPlayer.rating} />
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="duelo2v2-share-card__result">
          <div
            className="duelo2v2-share-card__score-inline"
            aria-label={`${presentation.setsWin} sets a ${presentation.setsLoss}`}
          >
            <span>{presentation.setsWin}</span>
            <span aria-hidden>·</span>
            <span>{presentation.setsLoss}</span>
          </div>
          <p className="duelo2v2-share-card__score-caption">
            {isWinner ? "Victoria final" : "Marcador final"}
          </p>

          {presentation.setRows.length > 0 ? (
            <div className="duelo2v2-share-card__sets" aria-label="Detalle por set">
              {presentation.setRows.map((row) => (
                <div key={row.label} className="duelo2v2-share-card__set">
                  <span>{row.label}</span>
                  <strong>{row.score}</strong>
                </div>
              ))}
            </div>
          ) : null}

          {presentation.gamesTotal ? (
            <p className="duelo2v2-share-card__games">{presentation.gamesTotal}</p>
          ) : null}
        </div>

        <p className="duelo2v2-share-card__message">{presentation.message}</p>

        <RivieraSocialFooter />
      </div>
    </article>
  );
}
