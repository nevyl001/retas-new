import React from "react";
import type { RivieraJugadorCategoria } from "../../lib/rivieraJugadores/types";
import { JUGADOR_CATEGORIA_AVATAR_BADGE } from "../../lib/rivieraJugadores/constants";

interface JugadorAvatarHeroProps {
  fotoUrl?: string | null;
  nombre: string;
  categoria: RivieraJugadorCategoria;
  className?: string;
}

export const JugadorAvatarHero: React.FC<JugadorAvatarHeroProps> = ({
  fotoUrl,
  nombre,
  categoria,
  className = "",
}) => {
  const initial = (nombre.trim()[0] ?? "?").toUpperCase();
  const badge = JUGADOR_CATEGORIA_AVATAR_BADGE[categoria];

  return (
    <div
      className={["rjp-ficha-avatar", className].filter(Boolean).join(" ")}
      aria-hidden={!fotoUrl}
    >
      <div className="rjp-ficha-avatar__circle">
        {fotoUrl ? (
          <img
            className="rjp-ficha-avatar__img"
            src={fotoUrl}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="rjp-ficha-avatar__initial">{initial}</span>
        )}
      </div>
      <span className="rjp-ficha-avatar__badge">{badge}</span>
    </div>
  );
};
