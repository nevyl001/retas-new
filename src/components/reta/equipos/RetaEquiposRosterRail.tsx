import React from "react";
import { useRetryableImage } from "../../../hooks/useRetryableImage";
import { getJugadorInitials } from "../../jugadores/JugadorAvatar";
import type { RetaEquiposPlayerCardData } from "./RetaEquiposPlayerCard";

type RetaEquiposRosterRailProps = {
  players: RetaEquiposPlayerCardData[];
  activeIndex: number;
  onSelect: (index: number) => void;
  teamName: string;
  side?: "a" | "b";
};

function playerSurname(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0]!;
  return parts[parts.length - 1]!;
}

const DockPill: React.FC<{
  player: RetaEquiposPlayerCardData;
  active: boolean;
  onSelect: () => void;
  side: "a" | "b";
}> = ({ player, active, onSelect, side }) => {
  const { src, onError } = useRetryableImage(player.fotoUrl);
  const initials = getJugadorInitials(player.nombre);
  const surname = playerSurname(player.nombre);

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={player.nombre}
      className={[
        "reta-eq-dock__pill",
        `reta-eq-dock__pill--${side}`,
        active ? "is-active" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onSelect}
    >
      <span className="reta-eq-dock__av" aria-hidden>
        {src ? (
          <img
            src={src}
            alt=""
            className="reta-eq-dock__av-img"
            loading="lazy"
            decoding="async"
            onError={onError}
          />
        ) : (
          <span className="reta-eq-dock__av-initials">{initials.slice(0, 2)}</span>
        )}
      </span>
      <span className="reta-eq-dock__surname">{surname}</span>
    </button>
  );
};

/**
 * Tactical fluid roster dock — pills (foto + apellido) por equipo.
 * Sustituye el carrusel de bolitas de iniciales.
 */
export const RetaEquiposRosterRail: React.FC<RetaEquiposRosterRailProps> = ({
  players,
  activeIndex,
  onSelect,
  teamName,
  side = "a",
}) => {
  if (players.length <= 1) return null;

  return (
    <div
      className={`reta-eq-dock reta-eq-dock--${side}`}
      role="tablist"
      aria-label={`Jugadores ${teamName}`}
    >
      {players.map((player, i) => (
        <DockPill
          key={player.id}
          player={player}
          active={i === activeIndex}
          onSelect={() => onSelect(i)}
          side={side}
        />
      ))}
    </div>
  );
};
