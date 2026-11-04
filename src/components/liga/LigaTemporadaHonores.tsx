import React from "react";
import {
  buildLigaCampeonatoCelebrateCopy,
  buildLigaTemporadaHonoresIntro,
  type LigaCelebratePlacement,
  type LigaSeasonHonoresStats,
} from "../../lib/liga/jornadaCelebrate";
import { formatPublicPodiumDif } from "../../lib/torneoExpress/publicEliminatoriaPodiumStats";
import type { PublicRetaWinnerAvatar } from "../public/PublicRetaWinnerSection";
import { getJugadorInitials } from "../jugadores/JugadorAvatar";
import { TablerIcon } from "../ui/TablerIcon";
import "./liga-pareja-victoria-celebrate.css";
import "./liga-temporada-honores.css";

export type LigaTemporadaHonoresPlayer = {
  name: string;
  fotoUrl?: string | null;
  jugadorId?: string | null;
};

export type LigaTemporadaHonoresSlot =
  | {
      placement: LigaCelebratePlacement;
      status: "resolved";
      pairLabel: string;
      players: LigaTemporadaHonoresPlayer[];
      stats: LigaSeasonHonoresStats | null;
    }
  | {
      placement: "tercer";
      status: "pending";
    };

function Portrait({
  player,
  size,
}: {
  player: LigaTemporadaHonoresPlayer;
  size: "hero" | "side";
}) {
  const initials = getJugadorInitials(player.name);
  return (
    <figure
      className={`liga-honores-portrait liga-honores-portrait--${size}`}
    >
      {player.fotoUrl ? (
        <img
          className="liga-honores-portrait__img"
          src={player.fotoUrl}
          alt=""
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="liga-honores-portrait__fallback" aria-hidden>
          {initials}
        </span>
      )}
      <figcaption className="liga-honores-portrait__name">
        {player.name}
      </figcaption>
    </figure>
  );
}

function StatsPanel({
  stats,
  emphasize,
}: {
  stats: LigaSeasonHonoresStats;
  emphasize?: boolean;
}) {
  const items: Array<{ label: string; value: string; accent?: boolean }> = [
    { label: "PG", value: String(stats.victorias) },
    { label: "PP", value: String(stats.derrotas) },
    { label: "GF", value: String(stats.juegosFavor) },
    { label: "GC", value: String(stats.juegosContra) },
    {
      label: "DIF",
      value: formatPublicPodiumDif(stats.dif),
      accent: true,
    },
  ];
  if (stats.puntos != null && Number.isFinite(stats.puntos)) {
    items.push({ label: "PTS", value: String(stats.puntos) });
  }

  return (
    <ul
      className={`liga-honores-stats${
        emphasize ? " liga-honores-stats--hero" : ""
      }`}
      aria-label="Resumen de toda la liga"
    >
      {items.map((item) => (
        <li
          key={item.label}
          className={`liga-honores-stats__item${
            item.accent ? " liga-honores-stats__item--dif" : ""
          }`}
        >
          <span className="liga-honores-stats__label">{item.label}</span>
          <span className="liga-honores-stats__value">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

function HonoresAmbient() {
  return (
    <div className="liga-celebrate-ambient liga-honores-card__ambient" aria-hidden>
      <span className="liga-celebrate-ball liga-celebrate-ball--a" />
      <span className="liga-celebrate-ball liga-celebrate-ball--b" />
      <span className="liga-celebrate-ball liga-celebrate-ball--c" />
    </div>
  );
}

function HonorCard({
  slot,
  ligaNombre,
  variant,
}: {
  slot: LigaTemporadaHonoresSlot;
  ligaNombre: string;
  variant: "hero" | "side";
}) {
  if (slot.status === "pending") {
    return (
      <article
        className={`liga-honores-card liga-honores-card--side liga-honores-card--pending`}
        aria-label="Tercer lugar por definir"
      >
        <HonoresAmbient />
        <header className="liga-honores-card__head">
          <span className="liga-honores-card__icon" aria-hidden>
            <TablerIcon name="medal" size={variant === "hero" ? 22 : 18} />
          </span>
          <p className="liga-honores-card__badge">TERCER LUGAR</p>
          <h3 className="liga-honores-card__title">Tercer lugar por definir</h3>
          <p className="liga-honores-card__message">
            El partido por el 3.er y 4.º lugar aún no tiene resultado. El podio
            se actualizará al guardar el marcador.
          </p>
        </header>
        <div className="liga-honores-card__pending-stage" aria-hidden>
          <span className="liga-honores-portrait liga-honores-portrait--ghost" />
          <span className="liga-honores-card__pair-join" />
          <span className="liga-honores-portrait liga-honores-portrait--ghost" />
        </div>
      </article>
    );
  }

  const copy = buildLigaCampeonatoCelebrateCopy(ligaNombre, slot.placement);
  const [p1, p2] = slot.players;
  const isHero = variant === "hero";

  return (
    <article
      className={`liga-honores-card liga-honores-card--${variant} liga-honores-card--${slot.placement}`}
      aria-label={`${copy.badge} — ${slot.pairLabel}`}
    >
      <HonoresAmbient />
      <header className="liga-honores-card__head">
        <span className="liga-honores-card__icon" aria-hidden>
          <TablerIcon
            name={slot.placement === "campeones" ? "trophy" : "medal"}
            size={isHero ? 22 : 18}
          />
        </span>
        <p className="liga-honores-card__badge">{copy.badge}</p>
        <p className="liga-honores-card__rank">{copy.rank}</p>
        <h3 className="liga-honores-card__title">{copy.title}</h3>
        {copy.message ? (
          <p className="liga-honores-card__message">{copy.message}</p>
        ) : null}
      </header>

      {p1 && p2 ? (
        <div className="liga-honores-card__pair" aria-label={slot.pairLabel}>
          <Portrait player={p1} size={isHero ? "hero" : "side"} />
          <span className="liga-honores-card__pair-join" aria-hidden>
            &
          </span>
          <Portrait player={p2} size={isHero ? "hero" : "side"} />
        </div>
      ) : null}

      {slot.stats ? (
        <StatsPanel stats={slot.stats} emphasize={isHero} />
      ) : null}
    </article>
  );
}

export type LigaTemporadaHonoresProps = {
  ligaNombre: string;
  campeones: Extract<LigaTemporadaHonoresSlot, { status: "resolved" }>;
  subcampeones: Extract<LigaTemporadaHonoresSlot, { status: "resolved" }>;
  tercer: LigaTemporadaHonoresSlot;
  participantes: string[];
};

export function winnersToHonoresPlayers(
  winners: PublicRetaWinnerAvatar[] | undefined,
  pairLabel: string
): LigaTemporadaHonoresPlayer[] {
  const parts = pairLabel
    .split(/\s*\/\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  return [
    {
      name: winners?.[0]?.name ?? parts[0] ?? "?",
      fotoUrl: winners?.[0]?.fotoUrl,
      jugadorId: winners?.[0]?.jugadorId,
    },
    {
      name: winners?.[1]?.name ?? parts[1] ?? "?",
      fotoUrl: winners?.[1]?.fotoUrl,
      jugadorId: winners?.[1]?.jugadorId,
    },
  ];
}

/**
 * Premiación de cierre de temporada (vista pública).
 * Campeones hero + Subcampeones / Tercer lugar + agradecimiento a participantes.
 */
export const LigaTemporadaHonores: React.FC<LigaTemporadaHonoresProps> = ({
  ligaNombre,
  campeones,
  subcampeones,
  tercer,
  participantes,
}) => {
  const intro = buildLigaTemporadaHonoresIntro(ligaNombre);

  return (
    <section className="liga-honores" aria-labelledby="liga-honores-title">
      <header className="liga-honores__intro">
        <p className="liga-honores__kicker">Riviera Open</p>
        <h2 id="liga-honores-title" className="liga-honores__title">
          {intro.title}
        </h2>
        <p className="liga-honores__subtitle">{intro.subtitle}</p>
        <p className="liga-honores__lead">{intro.lead}</p>
      </header>

      <div className="liga-honores__podium">
        <HonorCard
          slot={campeones}
          ligaNombre={ligaNombre}
          variant="hero"
        />
        <div className="liga-honores__row">
          <HonorCard
            slot={subcampeones}
            ligaNombre={ligaNombre}
            variant="side"
          />
          <HonorCard slot={tercer} ligaNombre={ligaNombre} variant="side" />
        </div>
      </div>

      <aside
        className="liga-honores-thanks"
        aria-label="Agradecimiento a todos los participantes"
      >
        <HonoresAmbient />
        <p className="liga-honores-thanks__badge">Todos los participantes</p>
        <h3 className="liga-honores-thanks__title">Gracias por la temporada</h3>
        <p className="liga-honores-thanks__copy">
          Cada partido, cada punto y cada esfuerzo construyeron esta liga. El
          reconocimiento es para todas las parejas que compitieron.
        </p>
        {participantes.length > 0 ? (
          <ul className="liga-honores-thanks__list">
            {participantes.map((name) => (
              <li key={name} className="liga-honores-thanks__item">
                {name}
              </li>
            ))}
          </ul>
        ) : null}
      </aside>
    </section>
  );
};
