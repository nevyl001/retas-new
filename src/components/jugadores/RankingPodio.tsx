import React from "react";
import { JugadorAvatar } from "./JugadorAvatar";

export type RankingPodioJugador = {
  id: string;
  nombre: string;
  foto_url?: string | null;
  pais_codigo?: string | null;
  stats?: { puntos_totales?: number | null } | null;
  slug?: string;
};

type MedalKey = "gold" | "silver" | "bronze";

const SLOTS: {
  medal: MedalKey;
  playerIdx: number;
  order: number;
  avatarSize: "lg" | "md";
  rankLabel: string;
}[] = [
  { medal: "silver", playerIdx: 1, order: -1, avatarSize: "md", rankLabel: "2" },
  { medal: "gold", playerIdx: 0, order: 0, avatarSize: "lg", rankLabel: "1" },
  { medal: "bronze", playerIdx: 2, order: 1, avatarSize: "md", rankLabel: "3" },
];

export const RankingPodio: React.FC<{
  jugadores: RankingPodioJugador[];
  /** Posiciones reales (empates comparten número). Índice alineado con `jugadores`. */
  ranks?: number[];
  onSelect: (slug: string) => void;
}> = ({ jugadores, ranks, onSelect }) => {
  if (jugadores.length === 0) return null;

  return (
    <div className="rjp-podio" aria-label="Podio top 3">
      {SLOTS.map(({ medal, playerIdx, order, avatarSize, rankLabel }) => {
        const jugador = jugadores[playerIdx];
        if (!jugador) return null;
        const displayRank = ranks?.[playerIdx] ?? rankLabel;

        return (
          <button
            key={medal}
            type="button"
            className={`rjp-podio__slot rjp-podio__slot--${medal}`}
            style={{ order }}
            disabled={!jugador.slug}
            onClick={() => {
              if (jugador.slug) onSelect(jugador.slug);
            }}
          >
            {displayRank === 1 ? (
              <span className="rjp-podio__trophy" aria-hidden>
                🏆
              </span>
            ) : null}
            <div className="rjp-podio__avatar-wrap">
              <span className="rjp-podio__medal" aria-hidden>
                {displayRank}
              </span>
              <JugadorAvatar
                fotoUrl={jugador.foto_url}
                nombre={jugador.nombre}
                size={avatarSize}
                className="rjp-podio__avatar"
              />
            </div>
            <span className="rjp-podio__name">{jugador.nombre}</span>
            <span className="rjp-podio__pts">
              {(jugador.stats?.puntos_totales ?? 0).toLocaleString("es-MX")} pts
            </span>
            <span className="rjp-podio__platform" aria-hidden />
          </button>
        );
      })}
    </div>
  );
};
