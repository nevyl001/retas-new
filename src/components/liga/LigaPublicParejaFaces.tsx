import React from "react";
import type { LigaEquipo, LigaJornadaPareja } from "../../lib/liga/types";
import { JugadorAvatar } from "../jugadores/JugadorAvatar";

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
  /** inline = avatar al lado del nombre (default). stack = nombre debajo. */
  orientation?: "inline" | "stack";
  className?: string;
  win?: boolean;
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
}) => (
  <div
    className={`liga-pub-pair-players liga-pub-pair-players--${size} liga-pub-pair-players--${orientation}${
      win ? " liga-pub-pair-players--win" : ""
    }${className ? ` ${className}` : ""}`}
  >
    <div className="liga-pub-pair-players__person">
      <JugadorAvatar
        fotoUrl={foto1}
        nombre={name1}
        size={size === "lg" ? "lg" : size}
        className="liga-pub-pair-players__avatar"
        alt={name1 !== "?" ? name1 : ""}
      />
      <span className="liga-pub-pair-players__name">{name1}</span>
    </div>
    <div className="liga-pub-pair-players__person">
      <JugadorAvatar
        fotoUrl={foto2}
        nombre={name2}
        size={size === "lg" ? "lg" : size}
        className="liga-pub-pair-players__avatar"
        alt={name2 !== "?" ? name2 : ""}
      />
      <span className="liga-pub-pair-players__name">{name2}</span>
    </div>
  </div>
);
