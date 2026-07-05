import React, { useCallback, useState } from "react";
import { isValidRivieraId } from "../../lib/rivieraJugadores/rivieraIdDisplay";
import type { RivieraJugador } from "../../lib/rivieraJugadores/types";
import { copyToClipboard } from "../../services/torneoExpressService";
import { ModernToast } from "../ModernToast";

interface RivieraIdBadgeProps {
  rivieraId?: string | null;
  className?: string;
  size?: "sm" | "md";
}

export const RivieraIdBadge: React.FC<RivieraIdBadgeProps> = ({
  rivieraId,
  className = "",
  size = "sm",
}) => {
  const [toastVisible, setToastVisible] = useState(false);

  const handleCopy = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!isValidRivieraId(rivieraId)) return;

      const ok = await copyToClipboard(rivieraId);
      if (ok) setToastVisible(true);
    },
    [rivieraId]
  );

  if (!isValidRivieraId(rivieraId)) return null;

  return (
    <>
      <button
        type="button"
        className={`rj-riviera-id rj-riviera-id--${size} ${className}`.trim()}
        onClick={(event) => void handleCopy(event)}
        title="Copiar Riviera ID"
        aria-label={`Copiar Riviera ID ${rivieraId}`}
      >
        <span className="rj-riviera-id__icon" aria-hidden>
          🆔
        </span>
        <span className="rj-riviera-id__text">{rivieraId}</span>
      </button>
      <ModernToast
        message="Riviera ID copiado"
        type="success"
        isVisible={toastVisible}
        onClose={() => setToastVisible(false)}
        duration={2200}
      />
    </>
  );
};

interface RivieraIdBadgeFromJugadorProps {
  jugador: Pick<RivieraJugador, "riviera_id">;
  className?: string;
  size?: "sm" | "md";
}

export const RivieraIdBadgeFromJugador: React.FC<
  RivieraIdBadgeFromJugadorProps
> = ({ jugador, className, size }) => (
  <RivieraIdBadge
    rivieraId={jugador.riviera_id}
    className={className}
    size={size}
  />
);
