import React, { useEffect, useRef, useState } from "react";
import {
  formatRemainingClock,
  hasRoundTimer,
  isRoundTimerActive,
  roundTimerKey,
  type RoundTimersState,
} from "../../lib/reta/roundTimers";
import { playRoundTimerEndedSound } from "../../lib/reta/roundTimerSound";

type RoundTimerPublicProps = {
  round: number;
  timers: RoundTimersState;
  className?: string;
};

/**
 * Tiempo restante en vista pública.
 * Activo: reloj. En 0:00: mensaje + sonido al cruzar el umbral.
 */
export const RoundTimerPublic: React.FC<RoundTimerPublicProps> = ({
  round,
  timers,
  className = "",
}) => {
  const entry = timers.rounds[roundTimerKey(round)];
  const [nowMs, setNowMs] = useState(() => Date.now());
  const armedRef = useRef(false);
  const endsAtRef = useRef(entry?.endsAt);

  const defined = hasRoundTimer(entry);
  const active = isRoundTimerActive(entry, nowMs);
  const clock = formatRemainingClock(entry, nowMs);
  const expired = defined && !active;

  useEffect(() => {
    if (!defined) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [defined, entry?.endsAt]);

  useEffect(() => {
    if (entry?.endsAt !== endsAtRef.current) {
      endsAtRef.current = entry?.endsAt;
      armedRef.current = false;
    }
    if (active) {
      armedRef.current = true;
      return;
    }
    if (expired && armedRef.current) {
      armedRef.current = false;
      playRoundTimerEndedSound();
    }
  }, [active, expired, entry?.endsAt]);

  if (!defined || !clock) return null;

  return (
    <span
      className={`round-timer-pub${expired ? " is-expired" : " is-live"} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-label={expired ? "Juego ha terminado" : `${clock} restantes`}
    >
      <span className="round-timer-pub__dot" aria-hidden />
      {expired ? (
        <span className="round-timer-pub__ended">
          <span className="round-timer-pub__clock">{clock}</span>
          <span className="round-timer-pub__msg">Juego ha terminado</span>
        </span>
      ) : (
        <span className="round-timer-pub__clock">{clock}</span>
      )}
    </span>
  );
};

export default RoundTimerPublic;
