import React, { useEffect, useState } from "react";
import {
  formatRemainingClock,
  hasRoundTimer,
  isRoundTimerActive,
  roundTimerKey,
  type RoundTimersState,
} from "../../lib/reta/roundTimers";

type RoundTimerPublicProps = {
  round: number;
  timers: RoundTimersState;
  className?: string;
};

/**
 * Tiempo restante en vista pública.
 * Activo: reloj destacado. En 0:00: rojo (fin de ronda).
 */
export const RoundTimerPublic: React.FC<RoundTimerPublicProps> = ({
  round,
  timers,
  className = "",
}) => {
  const entry = timers.rounds[roundTimerKey(round)];
  const [nowMs, setNowMs] = useState(() => Date.now());

  const defined = hasRoundTimer(entry);
  const active = isRoundTimerActive(entry, nowMs);
  const clock = formatRemainingClock(entry, nowMs);
  const expired = defined && !active;

  useEffect(() => {
    if (!defined) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [defined, entry?.endsAt]);

  if (!defined || !clock) return null;

  return (
    <span
      className={`round-timer-pub${expired ? " is-expired" : " is-live"} ${className}`.trim()}
      aria-label={expired ? "Tiempo agotado" : `${clock} restantes`}
    >
      <span className="round-timer-pub__dot" aria-hidden />
      <span className="round-timer-pub__clock">{clock}</span>
    </span>
  );
};

export default RoundTimerPublic;
