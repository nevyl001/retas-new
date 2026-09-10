import React, { useEffect, useRef, useState } from "react";
import {
  isPhotographicSplitVsFoto,
  playerAvatarHashTone,
  splitPlayerDisplayName,
} from "../../liga/jornada-public/ligaJornadaMatchNames";
import { JugadorRatingChip } from "../../jugadores/JugadorRatingChip";
import "./public-split-vs.css";

export interface PublicSplitVsPlayerPanelProps {
  name: string;
  /** URL de foto; `undefined` = aún resolviendo (fondo neutro, sin jersey). */
  foto?: string | null;
  rating?: number | null;
  className?: string;
}

function PadelPlayerSilhouette() {
  return (
    <svg
      className="pub-split-vs-panel__silhouette"
      viewBox="0 0 64 80"
      aria-hidden
      focusable="false"
    >
      <circle cx="32" cy="14" r="9" fill="currentColor" />
      <path
        d="M22 28c-2 8-4 18-3 28 1 8 4 14 8 18 2-6 1-14 0-22-1-8 0-16 2-24H22z"
        fill="currentColor"
      />
      <path
        d="M42 28c2 8 4 18 3 28-1 8-4 14-8 18-2-6-1-14 0-22 1-8 0-16-2-24h7z"
        fill="currentColor"
      />
      <ellipse
        cx="48"
        cy="52"
        rx="14"
        ry="18"
        transform="rotate(-25 48 52)"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <line
        x1="48"
        y1="52"
        x2="58"
        y2="72"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Panel a sangre para vistas públicas: foto real o jersey + iniciales.
 * Compartido entre Reta, Americano, Duelo y Liga.
 */
export const PublicSplitVsPlayerPanel: React.FC<
  PublicSplitVsPlayerPanelProps
> = ({ name, foto, rating, className }) => {
  const { primary, secondary } = splitPlayerDisplayName(name);
  const tone = playerAvatarHashTone(name);
  const initials = `${primary.charAt(0)}${
    secondary?.charAt(0) ?? primary.charAt(1) ?? ""
  }`.toUpperCase();
  const photosStillResolving = foto === undefined;
  const candidateFoto =
    !photosStillResolving && isPhotographicSplitVsFoto(foto)
      ? foto!.trim()
      : null;
  const [photoFailed, setPhotoFailed] = useState(false);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const showPhoto = Boolean(candidateFoto) && !photoFailed && photoLoaded;
  const awaitingPhoto =
    photosStillResolving ||
    (Boolean(candidateFoto) && !photoFailed && !photoLoaded);

  useEffect(() => {
    setPhotoFailed(false);
    setPhotoLoaded(false);
  }, [candidateFoto]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img || !candidateFoto) return;
    if (img.complete) {
      if (img.naturalWidth === 0) setPhotoFailed(true);
      else setPhotoLoaded(true);
    }
  }, [candidateFoto]);

  return (
    <div
      className={[
        "pub-split-vs-panel",
        showPhoto
          ? "pub-split-vs-panel--has-photo"
          : awaitingPhoto
            ? "pub-split-vs-panel--pending-photo"
            : "pub-split-vs-panel--fallback",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        awaitingPhoto || showPhoto
          ? undefined
          : ({
              ["--pub-split-vs-bg" as string]: tone.background,
              ["--pub-split-vs-fg" as string]: tone.color,
            } as React.CSSProperties)
      }
    >
      <span className="pub-split-vs-panel__texture" aria-hidden />
      {!awaitingPhoto && !showPhoto ? <PadelPlayerSilhouette /> : null}
      {!awaitingPhoto && !showPhoto ? (
        <span className="pub-split-vs-panel__watermark" aria-hidden>
          {initials}
        </span>
      ) : null}
      {candidateFoto && !photoFailed ? (
        <img
          ref={imgRef}
          className={`pub-split-vs-panel__photo${
            photoLoaded ? " is-visible" : ""
          }`}
          src={candidateFoto}
          alt=""
          loading="eager"
          decoding="async"
          onLoad={() => setPhotoLoaded(true)}
          onError={() => setPhotoFailed(true)}
        />
      ) : null}
      <span className="pub-split-vs-panel__scrim" aria-hidden />
      <span className="pub-split-vs-panel__identity">
        <span className="pub-split-vs-panel__given">{primary}</span>
        {secondary ? (
          <span className="pub-split-vs-panel__family">{secondary}</span>
        ) : null}
        <JugadorRatingChip
          rating={rating}
          className="pub-split-vs-panel__rating"
        />
      </span>
    </div>
  );
};
