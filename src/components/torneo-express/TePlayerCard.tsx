import React from "react";
import type { Player } from "../../lib/database";
import type { LegacyPlayerContact } from "../../lib/rivieraJugadores/playerPoolSync";
import type { RivieraJugadorCategoria } from "../../lib/rivieraJugadores/types";
import { JUGADOR_CATEGORIA_LABELS } from "../../lib/rivieraJugadores/constants";
import { JugadorCategoriaBadge } from "../jugadores/JugadorCategoriaBadge";
import { RivieraIdBadge } from "../jugadores/RivieraIdBadge";

export type TePlayerCardPlayer = Player &
  Pick<LegacyPlayerContact, "categoria" | "foto_url" | "riviera_id">;

interface TePlayerCardProps {
  player: TePlayerCardPlayer;
  /** Si se pasa, la card es un botón seleccionable. */
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  className?: string;
}

function asCategoria(
  value: LegacyPlayerContact["categoria"]
): RivieraJugadorCategoria | null {
  if (!value) return null;
  return value in JUGADOR_CATEGORIA_LABELS
    ? (value as RivieraJugadorCategoria)
    : null;
}

/**
 * Ficha compacta premium (mismo lenguaje visual que el registro / Duelo):
 * nombre + categoría + Riviera ID.
 */
export const TePlayerCard: React.FC<TePlayerCardProps> = ({
  player,
  onClick,
  selected = false,
  disabled = false,
  className = "",
}) => {
  const fotoUrl =
    typeof player.foto_url === "string" && player.foto_url.trim()
      ? player.foto_url.trim()
      : null;
  const rivieraId =
    typeof player.riviera_id === "string" && player.riviera_id.trim()
      ? player.riviera_id.trim()
      : null;
  const categoria = asCategoria(player.categoria);

  const classes = [
    "te-player-card",
    fotoUrl ? "te-player-card--has-photo" : "",
    selected ? "te-player-card--selected" : "",
    disabled ? "te-player-card--disabled" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const body = (
    <>
      {fotoUrl ? (
        <>
          <span
            className="te-player-card__photo"
            style={{ backgroundImage: `url(${fotoUrl})` }}
            aria-hidden
          />
          <span className="te-player-card__overlay" aria-hidden />
        </>
      ) : null}
      <span className="te-player-card__info">
        <span className="te-player-card__name" title={player.name}>
          {player.name}
        </span>
        <span className="te-player-card__meta">
          {categoria ? (
            <JugadorCategoriaBadge
              categoria={categoria}
              className="te-player-card__cat"
            />
          ) : null}
          {rivieraId ? (
            <RivieraIdBadge
              rivieraId={rivieraId}
              size="sm"
              embedded
              className="te-player-card__riviera-id"
            />
          ) : (
            <span className="te-player-card__no-id">Sin Riviera ID</span>
          )}
        </span>
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        onClick={onClick}
        disabled={disabled}
        aria-pressed={selected}
      >
        {body}
      </button>
    );
  }

  return (
    <div className={classes} role="listitem">
      {body}
    </div>
  );
};
