import React from "react";
import { getJugadorPerfilMeta } from "../../lib/rivieraJugadores/jugadorPerfilDisplay";
import type { RivieraJugador } from "../../lib/rivieraJugadores/types";

interface JugadorPerfilMetaProps {
  jugador: Pick<RivieraJugador, "edad" | "mano_dominante" | "en_cancha">;
  variant?: "card" | "inline";
  className?: string;
}

export const JugadorPerfilMeta: React.FC<JugadorPerfilMetaProps> = ({
  jugador,
  variant = "card",
  className = "",
}) => {
  const items = getJugadorPerfilMeta(jugador);
  if (items.length === 0) return null;

  const rootClass = [
    variant === "card" ? "rj-card__perfil" : "rj-perfil-meta",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <ul className={rootClass}>
      {items.map((item) => (
        <li key={item.label} className="rj-perfil-meta__item">
          <span className="rj-perfil-meta__lbl">{item.label}</span>
          <span className="rj-perfil-meta__val">{item.value}</span>
        </li>
      ))}
    </ul>
  );
};
