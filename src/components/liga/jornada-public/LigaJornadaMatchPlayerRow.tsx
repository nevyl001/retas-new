import React from "react";
import { JugadorAvatar } from "../../jugadores/JugadorAvatar";
import {
  playerAvatarHashTone,
  splitPlayerDisplayName,
} from "./ligaJornadaMatchNames";

interface LigaJornadaMatchPlayerRowProps {
  name: string;
  foto?: string | null;
}

/** Jugador: avatar arriba + nombre abajo (para pareja horizontal). */
export const LigaJornadaMatchPlayerRow: React.FC<
  LigaJornadaMatchPlayerRowProps
> = ({ name, foto }) => {
  const { primary, secondary } = splitPlayerDisplayName(name);
  const hasFoto = Boolean(foto?.trim());
  const tone = hasFoto ? null : playerAvatarHashTone(name);

  return (
    <div className="liga-jornada-match-player-row liga-jornada-match-player-row--stacked">
      <JugadorAvatar
        fotoUrl={foto}
        nombre={name}
        size="lg"
        loading="eager"
        className="liga-jornada-match-player-row__avatar"
        alt={name !== "?" ? name : ""}
        style={
          tone
            ? ({
                background: tone.background,
                color: tone.color,
                borderColor: "transparent",
              } as React.CSSProperties)
            : undefined
        }
      />
      <span className="liga-jornada-match-player-row__identity">
        <span className="liga-jornada-match-player-row__given">{primary}</span>
        {secondary ? (
          <span className="liga-jornada-match-player-row__family">{secondary}</span>
        ) : null}
      </span>
    </div>
  );
};
