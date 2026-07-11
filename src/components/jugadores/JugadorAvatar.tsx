import React from "react";
import { useRetryableImage } from "../../hooks/useRetryableImage";

interface JugadorAvatarProps {
  fotoUrl?: string | null;
  nombre: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZE_PX = { sm: 40, md: 48, lg: 64, xl: 96 } as const;

export const JugadorAvatar: React.FC<JugadorAvatarProps> = ({
  fotoUrl,
  nombre,
  size = "sm",
  className = "",
}) => {
  const px = SIZE_PX[size];
  const initial = (nombre.trim()[0] ?? "?").toUpperCase();
  const cls = ["rj-avatar", `rj-avatar--${size}`, className].filter(Boolean).join(" ");
  const { src, onError } = useRetryableImage(fotoUrl);

  if (src) {
    return (
      <span className={cls} aria-hidden>
        <img
          className="rj-avatar__img"
          src={src}
          alt=""
          width={px}
          height={px}
          loading="lazy"
          decoding="async"
          onError={onError}
        />
      </span>
    );
  }

  return (
    <span className={cls} aria-hidden>
      {initial}
    </span>
  );
};
