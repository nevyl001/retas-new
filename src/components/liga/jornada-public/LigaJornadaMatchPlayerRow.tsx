import React from "react";
import { JugadorAvatar } from "../../jugadores/JugadorAvatar";

interface LigaJornadaMatchPlayerRowProps {
  name: string;
  foto?: string | null;
}

/** Una fila jugador: avatar compacto + nombre con ellipsis. */
export const LigaJornadaMatchPlayerRow: React.FC<LigaJornadaMatchPlayerRowProps> = ({
  name,
  foto,
}) => (
  <div className="liga-jornada-match-player-row">
    <JugadorAvatar
      fotoUrl={foto}
      nombre={name}
      size="md"
      loading="eager"
      className="liga-jornada-match-player-row__avatar"
      alt={name !== "?" ? name : ""}
    />
    <span className="liga-jornada-match-player-row__name" title={name}>
      {name}
    </span>
  </div>
);
