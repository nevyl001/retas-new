import React from "react";
import { useRetryableImage } from "../../hooks/useRetryableImage";
import { isPhotographicSplitVsFoto, playerAvatarHashTone } from "../liga/jornada-public/ligaJornadaMatchNames";
import { getJugadorInitials } from "../jugadores/JugadorAvatar";
import "./americano-court-board.css";

export const AmericanoPortrait: React.FC<{
  name: string;
  fotoUrl?: string | null;
}> = ({ name, fotoUrl }) => {
  const photoCandidate = isPhotographicSplitVsFoto(fotoUrl) ? fotoUrl : null;
  const { src, onError } = useRetryableImage(photoCandidate);
  const tone = playerAvatarHashTone(name);
  const initials = getJugadorInitials(name);

  return (
    <div
      className={`am-portrait${src ? " am-portrait--photo" : " am-portrait--fallback"}`}
      style={
        src
          ? undefined
          : ({
              background: tone.background,
              color: tone.color,
            } as React.CSSProperties)
      }
    >
      {src ? (
        <img
          className="am-portrait__photo"
          src={src}
          alt=""
          onError={onError}
        />
      ) : (
        <span className="am-portrait__initials" aria-hidden>
          {initials}
        </span>
      )}
      <span className="am-portrait__scrim" aria-hidden />
      <span className="am-portrait__name">{name}</span>
    </div>
  );
};
