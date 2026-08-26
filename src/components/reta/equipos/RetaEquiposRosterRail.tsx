import React from "react";
import type { RetaEquiposPlayerCardData } from "./RetaEquiposPlayerCard";

type RetaEquiposRosterRailProps = {
  players: RetaEquiposPlayerCardData[];
  activeIndex: number;
  onSelect: (index: number) => void;
  teamName: string;
  side?: "a" | "b";
  /** Pausa el fill de la barra activa (hover / focus). */
  paused?: boolean;
  /** Duración del fill = autoplay (ms). */
  rotateMs?: number;
};

/**
 * Barras segmentadas estilo broadcast / Stories.
 * Sin círculos ni dock de avatares.
 */
export const RetaEquiposRosterRail: React.FC<RetaEquiposRosterRailProps> = ({
  players,
  activeIndex,
  onSelect,
  teamName,
  side = "a",
  paused = false,
  rotateMs = 5000,
}) => {
  if (players.length <= 1) return null;

  return (
    <div
      className={`reta-eq-dock reta-eq-dock--segments reta-eq-dock--${side}`}
      role="tablist"
      aria-label={`Jugadores ${teamName}`}
    >
      <div className="reta-eq-dock__segments">
        {players.map((player, i) => {
          const active = i === activeIndex;
          const past = i < activeIndex;
          return (
            <button
              key={player.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={player.nombre}
              title={player.nombre}
              className={[
                "reta-eq-dock__seg",
                `reta-eq-dock__seg--${side}`,
                active ? "is-active" : "",
                past ? "is-past" : "",
                paused && active ? "is-paused" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={
                active
                  ? ({
                      ["--reta-eq-seg-ms" as string]: `${rotateMs}ms`,
                    } as React.CSSProperties)
                  : undefined
              }
              onClick={() => onSelect(i)}
            >
              <span className="reta-eq-dock__seg-fill" aria-hidden />
            </button>
          );
        })}
      </div>
    </div>
  );
};
