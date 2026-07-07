import React from "react";
import { resolveOfficialPuntosDisplay } from "../../lib/rivieraJugadores/jugadorPuntosBreakdown";
import type { RivieraJugadorWithStats } from "../../lib/rivieraJugadores/types";

type JugadorOfficialRomcPuntosProps = {
  jugador: RivieraJugadorWithStats;
  className?: string;
  unavailableText?: string;
};

export const JugadorOfficialRomcPuntos: React.FC<JugadorOfficialRomcPuntosProps> = ({
  jugador,
  className = "",
  unavailableText = "Aún no tiene ranking oficial Riviera Open",
}) => {
  const official = resolveOfficialPuntosDisplay(jugador);

  if (official.kind === "unavailable") {
    return (
      <span
        className={`rjp-ficha-stat__val rjp-ficha-stat__val--empty rjp-romc-pts--na${
          className ? ` ${className}` : ""
        }`}
      >
        {unavailableText}
      </span>
    );
  }

  return (
    <span className={`rjp-ficha-stat__val${className ? ` ${className}` : ""}`}>
      {official.puntos.toLocaleString("es-MX")} pts
    </span>
  );
};
