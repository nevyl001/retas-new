import React, { useEffect, useState } from "react";
import { resolveCountdownDisplay } from "../../../lib/reta/retaEquiposCountdown";

type RetaEquiposCountdownProps = {
  programadoEn?: string | null;
  programadoHasta?: string | null;
  isFinished?: boolean | null;
  className?: string;
};

/**
 * Cuenta regresiva aislada: su propio interval (1s).
 * No provoca re-render del árbol padre.
 */
export const RetaEquiposCountdown: React.FC<RetaEquiposCountdownProps> = ({
  programadoEn,
  programadoHasta,
  isFinished = false,
  className = "",
}) => {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const display = resolveCountdownDisplay({
    programadoEn,
    programadoHasta,
    isFinished,
    nowMs,
  });

  const root = [
    "reta-eq-countdown",
    `reta-eq-countdown--${display.phase}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={root} aria-live="polite">
      <p className="reta-eq-countdown__headline">{display.headline}</p>
      {display.segments ? (
        <p className="reta-eq-countdown__digits" aria-label={display.segments.join(display.separator)}>
          {display.segments.map((seg, i) => (
            <React.Fragment key={`${seg}-${i}`}>
              {i > 0 ? (
                <span className="reta-eq-countdown__sep" aria-hidden>
                  {display.separator.trim() || ":"}
                </span>
              ) : null}
              <span className="reta-eq-countdown__seg" key={`${i}-${seg}`}>
                {seg}
              </span>
            </React.Fragment>
          ))}
        </p>
      ) : display.phase === "live" ? (
        <p className="reta-eq-countdown__live-mark">
          <span className="reta-eq-countdown__pulse" aria-hidden />
          En juego
        </p>
      ) : null}
    </div>
  );
};
