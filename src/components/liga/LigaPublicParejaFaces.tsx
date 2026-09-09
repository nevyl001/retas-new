import React from "react";
import type { LigaEquipo, LigaJornadaPareja } from "../../lib/liga/types";
import { JugadorAvatar } from "../jugadores/JugadorAvatar";
import { playerAvatarHashTone } from "./jornada-public/ligaJornadaMatchNames";

export function parejaPlayerNames(
  pareja: LigaJornadaPareja | undefined,
  equiposById?: Map<string, LigaEquipo>
): { name1: string; name2: string; id1: string; id2: string } {
  if (!pareja) {
    return { name1: "?", name2: "?", id1: "", id2: "" };
  }

  const equipoId = pareja.equipo_id?.trim();
  const equipo =
    equipoId && equiposById?.has(equipoId)
      ? equiposById.get(equipoId)
      : undefined;

  const name1 =
    equipo?.jugador1?.nombre?.trim() ||
    pareja.jugador1?.nombre?.trim() ||
    "?";
  const name2 =
    equipo?.jugador2?.nombre?.trim() ||
    pareja.jugador2?.nombre?.trim() ||
    "?";

  const id1 =
    (equipo?.jugador1_id || pareja.jugador1_id || "").trim() ||
    equipo?.jugador1?.id ||
    "";
  const id2 =
    (equipo?.jugador2_id || pareja.jugador2_id || "").trim() ||
    equipo?.jugador2?.id ||
    "";

  return {
    name1,
    name2,
    id1,
    id2,
  };
}

interface LigaPublicParejaPlayersProps {
  name1: string;
  name2: string;
  foto1?: string | null;
  foto2?: string | null;
  size?: "sm" | "md" | "lg";
  /** inline | stack | overlap (avatares apilados + nombres debajo). */
  orientation?: "inline" | "stack" | "overlap";
  className?: string;
  win?: boolean;
  /** 1 | 2 | 3 para borde medalla en avatares. */
  podium?: 1 | 2 | 3;
}

function avatarToneStyle(
  name: string,
  foto?: string | null
): React.CSSProperties | undefined {
  if (foto?.trim()) return undefined;
  const tone = playerAvatarHashTone(name);
  return {
    background: tone.background,
    color: tone.color,
    borderColor: "transparent",
  };
}

/** Pareja pública: dos jugadores con avatar + nombre. */
export const LigaPublicParejaPlayers: React.FC<LigaPublicParejaPlayersProps> = ({
  name1,
  name2,
  foto1,
  foto2,
  size = "sm",
  orientation = "inline",
  className = "",
  win = false,
  podium,
}) => {
  const avatarSize = size === "lg" ? "lg" : size;
  const podiumClass = podium ? ` liga-pub-pair-players--podium-${podium}` : "";

  if (orientation === "overlap") {
    return (
      <div
        className={`liga-pub-pair-players liga-pub-pair-players--${size} liga-pub-pair-players--overlap${
          win ? " liga-pub-pair-players--win" : ""
        }${podiumClass}${className ? ` ${className}` : ""}`}
      >
        <div className="liga-pub-pair-players__stack-avatars">
          <JugadorAvatar
            fotoUrl={foto1}
            nombre={name1}
            size={avatarSize}
            className="liga-pub-pair-players__avatar liga-pub-pair-players__avatar--front"
            alt={name1 !== "?" ? name1 : ""}
            style={avatarToneStyle(name1, foto1)}
          />
          <JugadorAvatar
            fotoUrl={foto2}
            nombre={name2}
            size={avatarSize}
            className="liga-pub-pair-players__avatar liga-pub-pair-players__avatar--back"
            alt={name2 !== "?" ? name2 : ""}
            style={avatarToneStyle(name2, foto2)}
          />
        </div>
        <div className="liga-pub-pair-players__stack-names">
          <span className="liga-pub-pair-players__name">{name1}</span>
          <span className="liga-pub-pair-players__name-sep" aria-hidden>
            /
          </span>
          <span className="liga-pub-pair-players__name">{name2}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`liga-pub-pair-players liga-pub-pair-players--${size} liga-pub-pair-players--${orientation}${
        win ? " liga-pub-pair-players--win" : ""
      }${podiumClass}${className ? ` ${className}` : ""}`}
    >
      <div className="liga-pub-pair-players__person">
        <JugadorAvatar
          fotoUrl={foto1}
          nombre={name1}
          size={avatarSize}
          className="liga-pub-pair-players__avatar"
          alt={name1 !== "?" ? name1 : ""}
          style={avatarToneStyle(name1, foto1)}
        />
        <span className="liga-pub-pair-players__name">{name1}</span>
      </div>
      <div className="liga-pub-pair-players__person">
        <JugadorAvatar
          fotoUrl={foto2}
          nombre={name2}
          size={avatarSize}
          className="liga-pub-pair-players__avatar"
          alt={name2 !== "?" ? name2 : ""}
          style={avatarToneStyle(name2, foto2)}
        />
        <span className="liga-pub-pair-players__name">{name2}</span>
      </div>
    </div>
  );
};
