import React from "react";
import { JUGADOR_NIVEL_CLASS, JUGADOR_NIVEL_LABELS } from "../../lib/rivieraJugadores/constants";
import type { RivieraJugadorNivel } from "../../lib/rivieraJugadores/types";

interface JugadorNivelBadgeProps {
  nivel: RivieraJugadorNivel;
  className?: string;
}

export const JugadorNivelBadge: React.FC<JugadorNivelBadgeProps> = ({
  nivel,
  className = "",
}) => {
  const cls = [
    "rj-nivel-badge",
    JUGADOR_NIVEL_CLASS[nivel],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <span className={cls}>{JUGADOR_NIVEL_LABELS[nivel]}</span>;
};
