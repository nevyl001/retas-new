import React from "react";
import { JugadorAvatar } from "../../jugadores/JugadorAvatar";
import { JugadorRatingChip } from "../../jugadores/JugadorRatingChip";
import "../../jugadores/riviera-jugadores.css";
import type { PublicRetaPairPlayer } from "../../public/PublicRetaPairSide";

function parsePairLabel(label: string): [string, string] {
  const parts = label.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean);
  return [parts[0] ?? "?", parts[1] ?? "?"];
}

export const PublicEliminatoriaPairShowcase: React.FC<{
  label: string;
  parejaId?: string | null;
  players?: PublicRetaPairPlayer[];
  variant?: "default" | "hero";
  className?: string;
}> = ({
  label,
  parejaId,
  players,
  variant = "default",
  className = "",
}) => {
  const [name1, name2] = parsePairLabel(label);
  const p1: PublicRetaPairPlayer = players?.[0] ?? {
    id: `${parejaId ?? label}-1`,
    name: name1,
  };
  const p2: PublicRetaPairPlayer = players?.[1] ?? {
    id: `${parejaId ?? label}-2`,
    name: name2,
  };

  const rootClass = [
    "te-elim-finalists-pair",
    variant === "hero" ? "te-elim-podium-pair--hero" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const avatarClass = [
    "te-elim-finalists-pair__avatar",
    variant === "hero" ? "te-elim-podium-pair__avatar--hero" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass}>
      <div className="te-elim-finalists-pair__avatars" aria-hidden>
        <div className="te-elim-finalists-pair__avatar-ring">
          <JugadorAvatar
            fotoUrl={p1.fotoUrl}
            nombre={p1.name}
            size="lg"
            className={avatarClass}
          />
        </div>
        <div className="te-elim-finalists-pair__avatar-ring te-elim-finalists-pair__avatar-ring--front">
          <JugadorAvatar
            fotoUrl={p2.fotoUrl}
            nombre={p2.name}
            size="lg"
            className={avatarClass}
          />
        </div>
      </div>
      <p className="te-elim-finalists-pair__label te-elim-podium-pair__label">
        <span>
          {p1.name}
          <JugadorRatingChip
            rating={p1.rating}
            className="te-elim-finalists-pair__rating"
          />
        </span>
        <span className="te-elim-finalists-pair__sep" aria-hidden>
          /
        </span>
        <span>
          {p2.name}
          <JugadorRatingChip
            rating={p2.rating}
            className="te-elim-finalists-pair__rating"
          />
        </span>
      </p>
    </div>
  );
};
