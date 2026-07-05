import React from "react";
import type { RivieraJugador } from "../../lib/rivieraJugadores/types";
import { isValidRivieraId } from "../../lib/rivieraJugadores/rivieraIdDisplay";
import { RivieraIdBadge } from "./RivieraIdBadge";

interface RivieraIdShareBlockProps {
  jugador: Pick<RivieraJugador, "riviera_id">;
  className?: string;
  variant?: "private" | "public";
}

/** Bloque visible para que el jugador copie y comparta su Riviera ID. */
export const RivieraIdShareBlock: React.FC<RivieraIdShareBlockProps> = ({
  jugador,
  className = "",
  variant = "public",
}) => {
  if (!isValidRivieraId(jugador.riviera_id)) return null;

  return (
    <div
      className={`rj-riviera-id-share rj-riviera-id-share--${variant} ${className}`.trim()}
    >
      <p className="rj-riviera-id-share__label">Riviera ID</p>
      <RivieraIdBadge rivieraId={jugador.riviera_id} size="md" />
      <p className="rj-riviera-id-share__hint">
        Comparte tu perfil con nuestros clubes aliados y usuarios. Sigue
        jugando, sigue sumando.
      </p>
    </div>
  );
};
