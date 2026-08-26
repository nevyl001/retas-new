import React from "react";
import { useRetryableImage } from "../../../hooks/useRetryableImage";
import { getJugadorInitials } from "../../jugadores/JugadorAvatar";
import { JugadorPaisBadge } from "../../jugadores/JugadorPaisBadge";
import {
  EN_CANCHA_LABELS,
  MANO_DOMINANTE_LABELS,
} from "../../../lib/rivieraJugadores/constants";
import type { EnCancha, ManoDominante } from "../../../lib/rivieraJugadores/types";
import { getPaisOption } from "../../../lib/rivieraJugadores/paises";
import type { RetaEquiposPlayerCardData } from "./RetaEquiposPlayerCard";

type RetaEquiposPlayerSpotlightProps = {
  player: RetaEquiposPlayerCardData;
  teamName?: string;
  index?: number;
  total?: number;
  className?: string;
};

function splitNombre(nombre: string): { first: string; rest: string | null } {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: nombre.trim() || "—", rest: null };
  return { first: parts[0]!, rest: parts.slice(1).join(" ") };
}

/**
 * Full-bleed player spotlight + gradient vignette.
 * Cross-fade / micro-scale morph via `.reta-eq-frame--enter`.
 */
export const RetaEquiposPlayerSpotlight: React.FC<RetaEquiposPlayerSpotlightProps> = ({
  player,
  teamName,
  index,
  total,
  className = "",
}) => {
  const { first, rest } = splitNombre(player.nombre);
  const initials = getJugadorInitials(player.nombre);
  const { src, onError } = useRetryableImage(player.fotoUrl);
  const pais = getPaisOption(player.nacionalidad);

  const compactBits: string[] = [];
  if (player.edad != null && Number.isFinite(player.edad)) {
    compactBits.push(`${player.edad}a`);
  }
  if (player.mano === "derecha") compactBits.push("DER");
  else if (player.mano === "izquierda") compactBits.push("IZQ");
  else if (player.mano === "ambidiestro") compactBits.push("AMB");
  else if (player.mano && player.mano in MANO_DOMINANTE_LABELS) {
    compactBits.push(MANO_DOMINANTE_LABELS[player.mano as ManoDominante].slice(0, 3).toUpperCase());
  }
  if (player.lado === "drive") compactBits.push("DR");
  else if (player.lado === "reves") compactBits.push("REV");
  else if (player.lado && player.lado in EN_CANCHA_LABELS) {
    compactBits.push(EN_CANCHA_LABELS[player.lado as EnCancha].slice(0, 3).toUpperCase());
  }

  const displayName = rest ? `${first} ${rest}` : first;

  return (
    <article
      className={["reta-eq-frame", className].filter(Boolean).join(" ")}
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
            <span className="reta-eq-frame__fallback-initials">{initials}</span>
          </div>
        )}
        <div className="reta-eq-frame__shade" aria-hidden />
      </div>

      <div className="reta-eq-frame__body">
        {teamName ? <p className="reta-eq-frame__team">{teamName}</p> : null}
        <h3 className="reta-eq-frame__name">
          <span className="reta-eq-frame__name-compact">{displayName}</span>
          <span className="reta-eq-frame__name-first">{first}</span>
          {rest ? <span className="reta-eq-frame__name-rest">{rest}</span> : null}
        </h3>
        {pais ? (
          <div className="reta-eq-frame__pais">
            <JugadorPaisBadge
              codigo={player.nacionalidad}
              size="sm"
              showCode={false}
            />
            <span>{pais.nombre}</span>
          </div>
        ) : null}
        {compactBits.length > 0 ? (
          <p className="reta-eq-frame__meta reta-eq-frame__meta--compact">
            {compactBits.join(" · ")}
          </p>
        ) : null}
        {typeof index === "number" && typeof total === "number" && total > 1 ? (
          <p className="reta-eq-frame__pos" aria-hidden>
            {index + 1} / {total}
          </p>
        ) : null}
      </div>
    </article>
  );
};
