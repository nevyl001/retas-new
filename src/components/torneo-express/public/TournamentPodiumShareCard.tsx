import React, { useState } from "react";
import {
  formatPodiumShareDif,
  type PodiumSharePresentation,
} from "../../../lib/torneoExpress/publicPodiumSharePresentation";
import {
  RIVIERA_SOCIAL_HANDLE,
  RIVIERA_SOCIAL_LINKS,
} from "../../../lib/rivieraBranding";
import { JugadorAvatar } from "../../jugadores/JugadorAvatar";
import { TablerIcon } from "../../ui/TablerIcon";

const SOCIAL_ICON_BY_ID = {
  instagram: "brand-instagram",
  tiktok: "brand-tiktok",
  facebook: "brand-facebook",
} as const;

export function TournamentPodiumShareCard({
  presentation,
  onShare,
  isSharing = false,
}: {
  presentation: PodiumSharePresentation;
  onShare?: () => void;
  isSharing?: boolean;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const displayPlayers = presentation.players.slice(0, 2);

  return (
    <section
      className={`te-podium-share te-podium-share--${presentation.place}`}
      data-podium-layout="story-9x16"
      data-podium-place={presentation.place}
      aria-label={`${presentation.title} · ${presentation.positionLabel}`}
    >
      <div className="te-podium-share__art">
        <span className="te-podium-share__ambient" aria-hidden />
        <span className="te-podium-share__court" aria-hidden />
        <span className="te-podium-share__grain" aria-hidden />
        <span className="te-podium-share__watermark" aria-hidden>
          RIVIERA OPEN
        </span>

        <header className="te-podium-share__brand">
          {presentation.clubLogoUrl && !logoFailed ? (
            <img
              src={presentation.clubLogoUrl}
              alt=""
              className="te-podium-share__club-logo"
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <span className="te-podium-share__club-mark" aria-hidden>
              {presentation.clubName.trim().slice(0, 1).toUpperCase()}
            </span>
          )}
          <div>
            <strong>{presentation.clubName}</strong>
            {presentation.showMotherAttribution ? (
              <span>
                <i aria-hidden />
                by Riviera Open
              </span>
            ) : null}
          </div>
        </header>

        <div className="te-podium-share__context">
          <div>
            <span>{presentation.tournamentName}</span>
            {presentation.category ? (
              <small>{presentation.category}</small>
            ) : null}
          </div>
          <span>{presentation.positionLabel}</span>
        </div>

        <div className="te-podium-share__hero">
          <p>{presentation.title}</p>
          <div
            className="te-podium-share__players"
            aria-label={presentation.title}
          >
            {displayPlayers.map((player, index) => (
              <React.Fragment key={player.id}>
                {index > 0 ? (
                  <span className="te-podium-share__pair-axis" aria-hidden>
                    <i />
                  </span>
                ) : null}
                <div className="te-podium-share__player">
                  <span className="te-podium-share__avatar-frame">
                    <JugadorAvatar
                      fotoUrl={player.fotoUrl}
                      nombre={player.name}
                      size="xl"
                      loading="lazy"
                      alt={player.fotoUrl ? `Foto de ${player.name}` : ""}
                      className="te-podium-share__avatar"
                    />
                  </span>
                  <strong title={player.name}>{player.name}</strong>
                </div>
              </React.Fragment>
            ))}
          </div>
          <h3>{presentation.headline}</h3>
          <p>{presentation.recognition}</p>
        </div>

        {presentation.stats ? (
          <section
            className="te-podium-share__stats"
            aria-label="Estadísticas en este torneo"
          >
            <span>EN ESTE TORNEO</span>
            <dl>
              <div>
                <dt>PJ</dt>
                <dd>{presentation.stats.partidos}</dd>
              </div>
              <div>
                <dt>PG</dt>
                <dd>{presentation.stats.victorias}</dd>
              </div>
              <div>
                <dt>PP</dt>
                <dd>{presentation.stats.derrotas}</dd>
              </div>
              <div>
                <dt>DIF</dt>
                <dd>{formatPodiumShareDif(presentation.stats.dif)}</dd>
              </div>
            </dl>
          </section>
        ) : null}

        <div className="te-podium-share__closing">
          <p>{presentation.motivation}</p>
          <p>
            Gracias por participar en el torneo y ser parte de esta competencia.
          </p>
          <strong>
            Esto no termina aquí. Nos vemos en la próxima competencia.
          </strong>
        </div>

        <footer className="te-podium-share__social">
          <strong>RIVIERA OPEN</strong>
          <div>
            <ul aria-label="Redes sociales Riviera Open">
              {RIVIERA_SOCIAL_LINKS.map((link) => (
                <li key={link.id}>
                  <TablerIcon name={SOCIAL_ICON_BY_ID[link.id]} size={14} />
                </li>
              ))}
            </ul>
            <span>{RIVIERA_SOCIAL_HANDLE}</span>
          </div>
        </footer>
      </div>

      {onShare ? (
        <button
          className="te-podium-share__cta"
          type="button"
          onClick={onShare}
          disabled={isSharing}
          aria-busy={isSharing}
        >
          {isSharing
            ? "Preparando reconocimiento…"
            : `Compartir ${presentation.title.toLowerCase()}`}
        </button>
      ) : null}
    </section>
  );
}
