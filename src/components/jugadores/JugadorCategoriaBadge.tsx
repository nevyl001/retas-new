import React from "react";
import {
  JUGADOR_CATEGORIA_CLASS,
  JUGADOR_CATEGORIA_LABELS,
} from "../../lib/rivieraJugadores/constants";
import type { RivieraJugadorCategoria } from "../../lib/rivieraJugadores/types";

interface JugadorCategoriaBadgeProps {
  categoria: RivieraJugadorCategoria;
  className?: string;
}

export const JugadorCategoriaBadge: React.FC<JugadorCategoriaBadgeProps> = ({
  categoria,
  className = "",
}) => {
  const cls = [
    "rj-cat-badge",
    JUGADOR_CATEGORIA_CLASS[categoria],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={cls}>{JUGADOR_CATEGORIA_LABELS[categoria]}</span>
  );
};
