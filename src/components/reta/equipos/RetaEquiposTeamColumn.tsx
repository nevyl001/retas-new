import React, { useEffect, useRef, useState } from "react";
import type { RetaEquiposPlayerCardData } from "./RetaEquiposPlayerCard";
import { RetaEquiposPlayerSpotlight } from "./RetaEquiposPlayerSpotlight";
import { RetaEquiposRosterRail } from "./RetaEquiposRosterRail";
import { RetaEquiposTeamIdentity } from "./RetaEquiposTeamIdentity";

type RetaEquiposTeamColumnProps = {
  teamName: string;
  logoUrl?: string | null;
  players: RetaEquiposPlayerCardData[];
  side: "a" | "b";
  /** Desfase de autoplay (Team B ~500ms). */
  staggerMs?: number;
  /** En desktop muestra identidad encima del frame. */
  showIdentity?: boolean;
  className?: string;
};

const ROTATE_MS = 4000;

/**
 * Columna de equipo: carta holográfica + carousel de avatares.
 * Rotación aislada (no afecta countdown ni hero padre).
 */
export const RetaEquiposTeamColumn: React.FC<RetaEquiposTeamColumnProps> = ({
  teamName,
  logoUrl,
  players,
  side,
  staggerMs = 0,
  showIdentity = true,
  className = "",
}) => {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

  useEffect(() => {
    if (reduceMotion || paused || players.length <= 1) return;
    let intervalId = 0;
    const startId = window.setTimeout(() => {
      intervalId = window.setInterval(() => {
        setActive((prev) => (prev + 1) % players.length);
      }, ROTATE_MS);
    }, staggerMs);
    return () => {
      window.clearTimeout(startId);
      window.clearInterval(intervalId);
    };
  }, [players.length, reduceMotion, paused, staggerMs]);

  const player = players[active] ?? null;

  return (
    <section
      ref={rootRef}
      className={[
        "reta-eq-col",
        `reta-eq-col--${side}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={`Equipo ${teamName}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
    >
      {showIdentity ? (
        <RetaEquiposTeamIdentity
          teamName={teamName}
          logoUrl={logoUrl}
          side={side}
          size="hero"
          className="reta-eq-col__identity"
        />
      ) : null}

      <div
        className="reta-eq-col__stage reta-eq-col__stage--float"
        aria-live="polite"
      >
        {player ? (
          <RetaEquiposPlayerSpotlight
            key={player.id}
            player={player}
            teamName={teamName}
            side={side}
            index={active}
            total={players.length}
            className="reta-eq-frame--holo"
          />
        ) : (
          <div className="reta-eq-frame reta-eq-frame--empty">
            <p className="reta-eq-col__empty">Sin jugadores asignados</p>
          </div>
        )}
      </div>

      <RetaEquiposRosterRail
        players={players}
        activeIndex={active}
        onSelect={setActive}
        teamName={teamName}
        side={side}
      />
    </section>
  );
};
