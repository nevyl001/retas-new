import React, { useEffect, useState } from "react";
import { useRetryableImage } from "../../../hooks/useRetryableImage";
import { getJugadorInitials } from "../../jugadores/JugadorAvatar";
import { JugadorPaisBadge } from "../../jugadores/JugadorPaisBadge";
import { EN_CANCHA_LABELS } from "../../../lib/rivieraJugadores/constants";
import type { EnCancha } from "../../../lib/rivieraJugadores/types";
import { getPaisOption } from "../../../lib/rivieraJugadores/paises";
import type { RetaEquiposPlayerCardData } from "./RetaEquiposPlayerCard";

/** Ritmo broadcast TV: una vuelta completa en 60s. */
const CYLINDER_DURATION_SEC = 60;

type RetaEquiposTeamCylinderProps = {
  players: RetaEquiposPlayerCardData[];
  teamName: string;
  side?: "a" | "b";
  /** left = gira Y negativo; right = Y positivo. */
  direction?: "left" | "right";
  /** Override de radio; si no, se adapta al viewport. */
  radiusPx?: number;
};

function ladoLabel(lado: RetaEquiposPlayerCardData["lado"]): string | null {
  if (lado === "drive") return "Drive";
  if (lado === "reves") return "Revés";
  if (lado && lado in EN_CANCHA_LABELS) {
    return EN_CANCHA_LABELS[lado as EnCancha];
  }
  return null;
}

function playerSurname(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0]!;
  return parts[parts.length - 1]!;
}

type CylinderMetrics = { radius: number; scale: number };

/** Radio + escala global para auto-fit sin solapamiento. */
function useCylinderMetrics(overridePx?: number): CylinderMetrics {
  const [metrics, setMetrics] = useState<CylinderMetrics>({
    radius: 110,
    scale: 0.85,
  });

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      if (typeof overridePx === "number") {
        setMetrics({
          radius: overridePx,
          scale: w < 480 ? 0.75 : w < 768 ? 0.88 : 1,
        });
        return;
      }
      if (w < 640) {
        setMetrics({ radius: 85, scale: 0.82 });
        return;
      }
      setMetrics({ radius: 160, scale: 1 });
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [overridePx]);

  return metrics;
}

const CylinderCard: React.FC<{
  player: RetaEquiposPlayerCardData;
  side: "a" | "b";
  angle: number;
  direction: "left" | "right";
}> = ({ player, side, angle, direction }) => {
  const { src, onError } = useRetryableImage(player.fotoUrl);
  const initials = getJugadorInitials(player.nombre).slice(0, 2) || "RO";
  const surname = playerSurname(player.nombre);
  const pais = getPaisOption(player.nacionalidad);
  const lado = ladoLabel(player.lado);

  return (
    <div
      className={`reta-eq-cara reta-eq-cara--${side} reta-eq-cara--${direction}`}
      style={
        {
          ["--ang" as string]: `${angle}deg`,
          ["--ang-n" as string]: String(angle),
        } as React.CSSProperties
      }
    >
      <article className="reta-eq-cara__card">
        <div className="reta-eq-cara__sheen" aria-hidden />

        <header className="reta-eq-cara__top">
          <span className="reta-eq-cara__pro">PRO</span>
          {lado ? <span className="reta-eq-cara__lado">{lado}</span> : null}
        </header>

        <div className="reta-eq-cara__avatar">
          {src ? (
            <span className="reta-eq-cara__photo-ring">
              <img
                src={src}
                alt={player.nombre}
                className="reta-eq-cara__img"
                loading="lazy"
                decoding="async"
                onError={onError}
              />
            </span>
          ) : (
            <span className="reta-eq-cara__medal" aria-hidden>
              <span className="reta-eq-cara__medal-sheen" />
              <span className="reta-eq-cara__medal-ring" />
              <span className="reta-eq-cara__medal-ini">{initials}</span>
            </span>
          )}
        </div>

        <footer className="reta-eq-cara__foot">
          <p className="reta-eq-cara__name">{surname}</p>
          {pais ? (
            <span className="reta-eq-cara__pais">
              <JugadorPaisBadge
                codigo={player.nacionalidad}
                size="sm"
                showCode={false}
              />
              <span>{pais.nombre}</span>
            </span>
          ) : null}
        </footer>
      </article>
    </div>
  );
};

/**
 * Tambor 3D continuo por equipo (estilo broadcast cylinder).
 * Solo presentación; sin estado de scoring.
 */
export const RetaEquiposTeamCylinder: React.FC<RetaEquiposTeamCylinderProps> = ({
  players,
  teamName,
  side = "a",
  direction = "left",
  radiusPx,
}) => {
  const total = Math.max(players.length, 1);
  const { radius, scale } = useCylinderMetrics(radiusPx);

  if (players.length === 0) {
    return (
      <div
        className={`reta-eq-scene reta-eq-scene--${side} reta-eq-scene--empty`}
        aria-label={`${teamName}: sin jugadores`}
      >
        <p className="reta-eq-scene__empty">Sin jugadores</p>
      </div>
    );
  }

  return (
    <div
      className={`reta-eq-scene reta-eq-scene--${side}`}
      aria-label={`Roster ${teamName}`}
      style={
        {
          ["--reta-eq-tambor-dur" as string]: `${CYLINDER_DURATION_SEC}s`,
          ["--reta-eq-rad" as string]: `${radius}px`,
          ["--reta-eq-scene-scale" as string]: String(scale),
        } as React.CSSProperties
      }
    >
      <div
        className={[
          "reta-eq-tambor",
          direction === "left"
            ? "reta-eq-tambor--left"
            : "reta-eq-tambor--right",
        ].join(" ")}
      >
        {players.map((player, index) => (
          <CylinderCard
            key={player.id}
            player={player}
            side={side}
            direction={direction}
            angle={(360 / total) * index}
          />
        ))}
      </div>
    </div>
  );
};
