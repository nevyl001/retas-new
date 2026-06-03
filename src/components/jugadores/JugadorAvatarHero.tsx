import React from "react";

interface JugadorAvatarHeroProps {
  fotoUrl?: string | null;
  nombre: string;
  className?: string;
}

export const JugadorAvatarHero: React.FC<JugadorAvatarHeroProps> = ({
  fotoUrl,
  nombre,
  className = "",
}) => {
  const initial = (nombre.trim()[0] ?? "?").toUpperCase();

  return (
    <div
      className={["rjp-avatar-hero", className].filter(Boolean).join(" ")}
      aria-hidden={!fotoUrl}
    >
      <div className="rjp-avatar-hero__ring" />
      <div className="rjp-avatar-hero__glow" />
      <div className="rjp-avatar-hero__inner">
        {fotoUrl ? (
          <img
            className="rjp-avatar-hero__img"
            src={fotoUrl}
            alt=""
            width={88}
            height={88}
            loading="lazy"
          />
        ) : (
          <>
            <span className="rjp-avatar-hero__watermark" aria-hidden>
              🎾
            </span>
            <span className="rjp-avatar-hero__initial">{initial}</span>
          </>
        )}
      </div>
      <span className="rjp-avatar-hero__shine" aria-hidden />
    </div>
  );
};
