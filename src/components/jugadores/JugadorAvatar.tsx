import React from "react";
import { useRetryableImage } from "../../hooks/useRetryableImage";

interface JugadorAvatarProps {
  fotoUrl?: string | null;
  nombre: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZE_PX = { sm: 40, md: 48, lg: 64, xl: 96 } as const;

export function getJugadorInitials(nombre: string): string {
  const parts = nombre
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
  }

  const token = parts[0] ?? "";
  if (!token) return "?";
  const first = token[0] ?? "";
  const numericSuffix = token.match(/\d+$/)?.[0];
  if (numericSuffix) {
    return `${first}${numericSuffix.slice(-2)}`.toUpperCase();
  }
  const last = token[token.length - 1] ?? "";
  return `${first}${last !== first ? last : ""}`.toUpperCase();
}

export const JugadorAvatar: React.FC<JugadorAvatarProps> = ({
  fotoUrl,
  nombre,
  size = "sm",
  className = "",
}) => {
  const px = SIZE_PX[size];
  const initials = getJugadorInitials(nombre);
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
      {initials}
    </span>
  );
};
