import React from "react";

interface JugadorAvatarProps {
  fotoUrl?: string | null;
  nombre: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_PX = { sm: 40, md: 48, lg: 64 } as const;

export const JugadorAvatar: React.FC<JugadorAvatarProps> = ({
  fotoUrl,
  nombre,
  size = "sm",
  className = "",
}) => {
  const px = SIZE_PX[size];
  const initial = (nombre.trim()[0] ?? "?").toUpperCase();
  const cls = ["rj-avatar", `rj-avatar--${size}`, className].filter(Boolean).join(" ");

  if (fotoUrl) {
    return (
      <img
        className={cls}
        src={fotoUrl}
        alt=""
        width={px}
        height={px}
        loading="lazy"
      />
    );
  }

  return (
    <span
      className={cls}
      style={{ width: px, height: px }}
      aria-hidden
    >
      {initial}
    </span>
  );
};
