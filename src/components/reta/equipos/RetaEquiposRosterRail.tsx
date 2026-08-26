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

/**
 * Carousel horizontal de avatares (anillo activo por equipo).
 * Reemplaza track segmentado + grilla de pills.
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
      <div className="reta-eq-dock__carousel">
        {players.map((player, i) => (
          <RosterAvatar
            key={player.id}
            player={player}
            active={i === activeIndex}
            onSelect={() => onSelect(i)}
            side={side}
          />
        ))}
      </div>
    </div>
  );
};

const RosterAvatar: React.FC<{
  player: RetaEquiposPlayerCardData;
  active: boolean;
  onSelect: () => void;
  side: "a" | "b";
}> = ({ player, active, onSelect, side }) => {
  const { src, onError } = useRetryableImage(player.fotoUrl);
  const initials = getJugadorInitials(player.nombre);

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={player.nombre}
      title={player.nombre}
      className={[
        "reta-eq-dock__av-btn",
        `reta-eq-dock__av-btn--${side}`,
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
          <span className="reta-eq-dock__av-initials">
            {initials.slice(0, 2)}
          </span>
        )}
      </span>
    </button>
  );
};
