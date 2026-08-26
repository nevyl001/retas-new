import React from "react";
import { useRetryableImage } from "../../../hooks/useRetryableImage";
import { getJugadorInitials } from "../../jugadores/JugadorAvatar";
import { JugadorPaisBadge } from "../../jugadores/JugadorPaisBadge";
import { EN_CANCHA_LABELS } from "../../../lib/rivieraJugadores/constants";
import type { EnCancha } from "../../../lib/rivieraJugadores/types";
import { getPaisOption } from "../../../lib/rivieraJugadores/paises";
import type { RetaEquiposPlayerCardData } from "./RetaEquiposPlayerCard";

type RetaEquiposPlayerSpotlightProps = {
  player: RetaEquiposPlayerCardData;
  teamName?: string;
  side?: "a" | "b";
  index?: number;
  total?: number;
  className?: string;
};

function splitNombre(nombre: string): { first: string; rest: string | null } {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: nombre.trim() || "—", rest: null };
  return { first: parts[0]!, rest: parts.slice(1).join(" ") };
}

function ladoLabel(lado: RetaEquiposPlayerCardData["lado"]): string | null {
  if (lado === "drive") return "Drive";
  if (lado === "reves") return "Revés";
  if (lado && lado in EN_CANCHA_LABELS) {
    return EN_CANCHA_LABELS[lado as EnCancha];
  }
  return null;
}

/**
 * Carta holográfica broadcast (reveal 3D + shimmer).
 * País + Drive/Revés. Sin edad ni mano.
 */
export const RetaEquiposPlayerSpotlight: React.FC<
  RetaEquiposPlayerSpotlightProps
> = ({
  player,
  teamName,
  side = "a",
  index,
  total,
  className = "",
}) => {
  const { first, rest } = splitNombre(player.nombre);
  const initials = getJugadorInitials(player.nombre);
  const mark = initials.slice(0, 2) || "RO";
  const { src, onError } = useRetryableImage(player.fotoUrl);
  const pais = getPaisOption(player.nacionalidad);
  const lado = ladoLabel(player.lado);
  const displayName = rest ? `${first} ${rest}` : first;

  return (
    <article
      className={[
        "reta-eq-frame",
        `reta-eq-frame--${side}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="reta-eq-frame__media">
        {src ? (
          <img
            className="reta-eq-frame__cover"
            src={src}
            alt={player.nombre}
            loading="eager"
            decoding="async"
            onError={onError}
          />
        ) : (
          <div className="reta-eq-frame__fallback" aria-hidden>
            <span className="reta-eq-frame__fallback-wm">{mark}</span>
            <span className={`reta-eq-frame__emblem reta-eq-frame__emblem--${side}`}>
              <span className="reta-eq-frame__emblem-glow" />
              <span className="reta-eq-frame__emblem-shield">
                <span className="reta-eq-frame__emblem-initials">{mark}</span>
              </span>
            </span>
          </div>
        )}
        <div className="reta-eq-frame__shade" aria-hidden />
        <div className="reta-eq-frame__shimmer" aria-hidden />
      </div>

      <div className="reta-eq-frame__body">
        {teamName ? <p className="reta-eq-frame__team">{teamName}</p> : null}
        <h3 className="reta-eq-frame__name">
          <span className="reta-eq-frame__name-compact">{displayName}</span>
          <span className="reta-eq-frame__name-first">{first}</span>
          {rest ? <span className="reta-eq-frame__name-rest">{rest}</span> : null}
        </h3>

        <div className="reta-eq-frame__attrs">
          {pais ? (
            <span className="reta-eq-frame__chip reta-eq-frame__chip--pais">
              <JugadorPaisBadge
                codigo={player.nacionalidad}
                size="sm"
                showCode={false}
              />
              <span>{pais.nombre}</span>
            </span>
          ) : null}
          {lado ? (
            <span
              className={[
                "reta-eq-frame__chip",
                "reta-eq-frame__chip--lado",
                `reta-eq-frame__chip--lado-${side}`,
              ].join(" ")}
            >
              <span>{lado}</span>
            </span>
          ) : null}
        </div>

        {typeof index === "number" && typeof total === "number" && total > 1 ? (
          <p className="reta-eq-frame__pos" aria-hidden>
            {index + 1} / {total}
          </p>
        ) : null}
      </div>
    </article>
  );
};
