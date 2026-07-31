import React, { useCallback, useEffect, useRef, useState } from "react";
import { isValidRivieraId } from "../../lib/rivieraJugadores/rivieraIdDisplay";
import type { RivieraJugador } from "../../lib/rivieraJugadores/types";
import { copyToClipboard } from "../../services/torneoExpressService";

interface RivieraIdBadgeProps {
  rivieraId?: string | null;
  className?: string;
  size?: "sm" | "md";
  /** Dentro de otra card/botón clicable: evita `<button>` anidado. */
  embedded?: boolean;
}

export const RivieraIdBadge: React.FC<RivieraIdBadgeProps> = ({
  rivieraId,
  className = "",
  size = "sm",
  embedded = false,
}) => {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimer.current != null) {
        window.clearTimeout(copiedTimer.current);
      }
    };
  }, []);

  const handleCopy = useCallback(
    async (event: React.MouseEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!isValidRivieraId(rivieraId)) return;

      const ok = await copyToClipboard(rivieraId);
      if (!ok) return;

      setCopied(true);
      if (copiedTimer.current != null) {
        window.clearTimeout(copiedTimer.current);
      }
      copiedTimer.current = window.setTimeout(() => {
        setCopied(false);
        copiedTimer.current = null;
      }, 1600);
    },
    [rivieraId]
  );

  if (!isValidRivieraId(rivieraId)) return null;

  const classNames = [
    "rj-riviera-id",
    `rj-riviera-id--${size}`,
    copied ? "rj-riviera-id--copied" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const label = copied ? "Copiado" : rivieraId;
  const a11y = copied
    ? `Riviera ID ${rivieraId} copiado`
    : `Copiar Riviera ID ${rivieraId}`;

  const inner = (
    <span className="rj-riviera-id__text">{label}</span>
  );

  return embedded ? (
    <span
      className={classNames}
      onClick={(event) => void handleCopy(event)}
      title={copied ? "Copiado" : "Copiar Riviera ID"}
      aria-label={a11y}
      role="status"
    >
      {inner}
    </span>
  ) : (
    <button
      type="button"
      className={classNames}
      onClick={(event) => void handleCopy(event)}
      title={copied ? "Copiado" : "Copiar Riviera ID"}
      aria-label={a11y}
    >
      {inner}
    </button>
  );
};

interface RivieraIdBadgeFromJugadorProps {
  jugador: Pick<RivieraJugador, "riviera_id">;
  className?: string;
  size?: "sm" | "md";
  embedded?: boolean;
}

export const RivieraIdBadgeFromJugador: React.FC<
  RivieraIdBadgeFromJugadorProps
> = ({ jugador, className, size, embedded }) => (
  <RivieraIdBadge
    rivieraId={jugador.riviera_id}
    className={className}
    size={size}
    embedded={embedded}
  />
);
