import React from "react";
import { JugadorAvatar } from "./JugadorAvatar";
import { RivieraIdBadgeFromJugador } from "./RivieraIdBadge";
import { RankingPtsDisplay } from "./RankingPtsDisplay";
import type { RivieraJugadorWithStats } from "../../lib/rivieraJugadores/types";

export type RankingPodioJugador = Pick<
  RivieraJugadorWithStats,
  "id" | "nombre" | "foto_url" | "pais_codigo" | "stats" | "slug" | "riviera_id"
> &
  Partial<
    Pick<
      RivieraJugadorWithStats,
      | "concedidoPorAdmin"
      | "statsOrigenConcedido"
      | "grantedAccess"
      | "organizador_id"
      | "multiclubGranteePuntos"
      | "officialPuntosGlobal"
    >
  >;

type MedalKey = "gold" | "silver" | "bronze";

const SLOTS: {
  medal: MedalKey;
  playerIdx: number;
  rankFallback: string;
  avatarSize: "lg" | "md";
}[] = [
  { medal: "gold", playerIdx: 0, rankFallback: "1", avatarSize: "lg" },
  { medal: "silver", playerIdx: 1, rankFallback: "2", avatarSize: "md" },
  { medal: "bronze", playerIdx: 2, rankFallback: "3", avatarSize: "md" },
];

export const RankingPodio: React.FC<{
  jugadores: RankingPodioJugador[];
  /** Posiciones reales (empates comparten número). Índice alineado con `jugadores`. */
  ranks?: number[];
  clubOrganizadorId?: string | null;
  internalClub?: boolean;
  onSelect: (slug: string) => void;
}> = ({ jugadores, ranks, clubOrganizadorId = null, internalClub = false, onSelect }) => {
  if (jugadores.length === 0) return null;

  return (
    <div className="rjp-podio" aria-label="Top 3 del ranking">
      {SLOTS.map(({ medal, playerIdx, rankFallback, avatarSize }) => {
        const jugador = jugadores[playerIdx];
        if (!jugador) return null;
        const displayRank = ranks?.[playerIdx] ?? rankFallback;

        return (
          <button
            key={medal}
            type="button"
            className={`rjp-podio__slot rjp-podio__slot--${medal}`}
            disabled={!jugador.slug}
            aria-label={`Ver perfil de ${jugador.nombre}, posición ${displayRank}`}
            onClick={() => {
              if (jugador.slug) onSelect(jugador.slug);
            }}
          >
            <span className="rjp-podio__rank" aria-hidden>
              {displayRank}º
            </span>
            <div className="rjp-podio__avatar-wrap">
              <JugadorAvatar
                fotoUrl={jugador.foto_url}
                nombre={jugador.nombre}
                size={avatarSize}
                className="rjp-podio__avatar"
              />
            </div>
            <span className="rjp-podio__name">{jugador.nombre}</span>
            <RivieraIdBadgeFromJugador jugador={jugador} embedded />
            <RankingPtsDisplay
              jugador={jugador as RivieraJugadorWithStats}
              clubOrganizadorId={clubOrganizadorId}
              internalClub={internalClub}
              className="rjp-podio__pts"
              variant="stacked"
            />
          </button>
        );
      })}
    </div>
  );
};
