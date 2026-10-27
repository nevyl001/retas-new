import React from "react";
import { useRetryableImage } from "../../hooks/useRetryableImage";
import {
  isPhotographicSplitVsFoto,
  playerAvatarHashTone,
  splitPlayerDisplayName,
} from "../liga/jornada-public/ligaJornadaMatchNames";
import { getJugadorInitials } from "../jugadores/JugadorAvatar";
import { JugadorRatingChip } from "../jugadores/JugadorRatingChip";
import "./americano-court-board.css";

export const AmericanoPortrait: React.FC<{
  name: string;
  fotoUrl?: string | null;
  rating?: number | null;
}> = ({ name, fotoUrl, rating }) => {
  const photoCandidate = isPhotographicSplitVsFoto(fotoUrl) ? fotoUrl : null;
  const { src, onError } = useRetryableImage(photoCandidate);
  const tone = playerAvatarHashTone(name);
  const initials = getJugadorInitials(name);
  const { primary, secondary } = splitPlayerDisplayName(name);

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
      {rating !== undefined ? (
        <JugadorRatingChip rating={rating} className="am-portrait__rating" />
      ) : null}
      <span className="am-portrait__identity">
        <span className="am-portrait__given">{primary}</span>
        {secondary ? (
          <span className="am-portrait__family">{secondary}</span>
        ) : null}
      </span>
    </div>
  );
};
