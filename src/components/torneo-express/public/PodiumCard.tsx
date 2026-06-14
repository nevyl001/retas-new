import React, { useMemo } from "react";
import type { PublicFinalistEntry } from "../../../lib/torneoExpress/publicBracketModel";
import {
  formatPublicPodiumDif,
  type PublicEliminatoriaPodiumStats,
} from "../../../lib/torneoExpress/publicEliminatoriaPodiumStats";
import { PublicRivieraSocialBar } from "../../public/PublicRivieraSocialBar";
import type { PublicRetaPairPlayer } from "../../public/PublicRetaPairSide";
import { TablerIcon } from "../../ui/TablerIcon";
import "./te-public-podium-card.css";

export type PodiumPosition = 1 | 2 | 3;

const PODIUM_VARIANT: Record<
  PodiumPosition,
  {
    badge: string;
    title: string;
    rank: string;
    message: string;
    modifier: string;
    bg: string;
    accent: string;
  }
> = {
  1: {
    badge: "CAMPEONES",
    title: "¡Campeones!",
    rank: "1.er lugar",
    message:
      "Una final inolvidable. Gracias por dejarlo todo en la cancha y elevar el torneo.",
    modifier: "first",
    bg: "var(--ro-bg-surface)",
    accent: "var(--ro-medal-gold)",
  },
  2: {
    badge: "SUBCAMPEONES",
    title: "¡Gran Final!",
    rank: "2.º lugar",
    message:
      "Gran final en Riviera Open. Compitieron al más alto nivel hasta el último punto.",
    modifier: "second",
    bg: "var(--ro-bg-deep)",
    accent: "var(--ro-medal-silver)",
  },
  3: {
    badge: "TERCER LUGAR",
    title: "¡Felicidades!",
    rank: "3.er lugar",
    message:
      "Gran recorrido en Riviera Open. Semifinalistas de alto nivel que compitieron con pasión y entrega en cada partido.",
    modifier: "third",
    bg: "var(--ro-bg-deep)",
    accent: "var(--ro-medal-bronze)",
  },
};

function parsePairLabel(label: string): [string, string] {
  const parts = label.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean);
  return [parts[0] ?? "?", parts[1] ?? "?"];
}

function PodiumAvatar({ player }: { player: PublicRetaPairPlayer }) {
  const initial = (player.name.trim()[0] ?? "?").toUpperCase();

  return (
    <div className="podium-card__avatar-shell">
      {player.fotoUrl ? (
        <img
          className="podium-card__avatar-img"
          src={player.fotoUrl}
          alt=""
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="podium-card__avatar-initial" aria-hidden>
          {initial}
        </span>
      )}
    </div>
  );
}

function PodiumStats({
  stats,
  accent,
}: {
  stats: PublicEliminatoriaPodiumStats;
  accent: string;
}) {
  return (
    <div className="podium-card__stats" aria-label="Resumen del torneo">
      <div className="podium-card__stat">
        <span className="podium-card__stat-label">Victorias</span>
        <span
          className="podium-card__stat-value"
          style={{ color: accent }}
        >
          {stats.victorias}
        </span>
      </div>
      <div className="podium-card__stat">
        <span className="podium-card__stat-label">Derrotas</span>
        <span className="podium-card__stat-value podium-card__stat-value--losses">
          {stats.derrotas}
        </span>
      </div>
      <div className="podium-card__stat">
        <span className="podium-card__stat-label">Partidos</span>
        <span
          className="podium-card__stat-value"
          style={{ color: accent }}
        >
          {stats.partidos}
        </span>
      </div>
      <div className="podium-card__stat">
        <span className="podium-card__stat-label">Dif. juegos</span>
        <span
          className="podium-card__stat-value"
          style={{ color: accent }}
        >
          {formatPublicPodiumDif(stats.dif)}
        </span>
      </div>
    </div>
  );
}

export const PodiumCard: React.FC<{
  position: PodiumPosition;
  entry: PublicFinalistEntry;
  categoria: string | null;
  torneoNombre: string;
  pairPlayersById: Record<string, PublicRetaPairPlayer[]>;
  stats?: PublicEliminatoriaPodiumStats | null;
}> = ({
  position,
  entry,
  categoria,
  torneoNombre,
  pairPlayersById,
  stats,
}) => {
  const variant = PODIUM_VARIANT[position];
  const [name1, name2] = parsePairLabel(entry.label);

  const players = useMemo(() => {
    const loaded = entry.parejaId
      ? pairPlayersById[entry.parejaId]
      : undefined;
    return [
      loaded?.[0] ?? {
        id: `${entry.parejaId ?? entry.label}-1`,
        name: name1,
      },
      loaded?.[1] ?? {
        id: `${entry.parejaId ?? entry.label}-2`,
        name: name2,
      },
    ] as PublicRetaPairPlayer[];
  }, [entry, pairPlayersById, name1, name2]);

  const subtitle = [
    categoria ? `Categoría · ${categoria.toUpperCase()}` : null,
    variant.rank,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      className={[
        "podium-card",
        "te-pub-fade-in",
        `podium-card--${variant.modifier}`,
      ].join(" ")}
      style={
        {
          "--podium-accent": variant.accent,
        } as React.CSSProperties
      }
      aria-label={`${variant.badge} — ${variant.rank}`}
    >
      <span className="podium-card__corner podium-card__corner--tl" aria-hidden />
      <span className="podium-card__corner podium-card__corner--tr" aria-hidden />
      <span className="podium-card__corner podium-card__corner--bl" aria-hidden />
      <span className="podium-card__corner podium-card__corner--br" aria-hidden />

      <div className="podium-card__inner">
        <p className="podium-card__torneo-name">{torneoNombre}</p>
        <div className="podium-card__gold-line" aria-hidden />
        <p className="podium-card__badge">{variant.badge}</p>
        <h2 className="podium-card__title">{variant.title}</h2>
        {subtitle ? <p className="podium-card__subtitle">{subtitle}</p> : null}

        <div className="podium-card__players" aria-label={variant.badge}>
          <div className="podium-card__player">
            <PodiumAvatar player={players[0]} />
            <p className="podium-card__player-name">{players[0].name}</p>
          </div>

          <div className="podium-card__trophy-wrap" aria-hidden>
            <TablerIcon
              name="trophy"
              size={20}
              className="podium-card__trophy"
            />
          </div>

          <div className="podium-card__player">
            <PodiumAvatar player={players[1]} />
            <p className="podium-card__player-name">{players[1].name}</p>
          </div>
        </div>

        <p className="podium-card__quote">{variant.message}</p>

        {stats ? (
          <PodiumStats stats={stats} accent={variant.accent} />
        ) : null}

        <div className="podium-card__footer-divider" aria-hidden />

        <footer className="podium-card__footer">
          <p className="podium-card__footer-torneo">{torneoNombre}</p>
          <p className="podium-card__footer-tagline">Vive Riviera Open</p>
          <PublicRivieraSocialBar compact className="podium-card__social" />
        </footer>
      </div>
    </section>
  );
};
