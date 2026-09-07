import React, { useEffect, useRef, useState } from "react";
import {
  formatRemainingClock,
  hasRoundTimer,
  isRoundTimerActive,
  roundTimerKey,
  type RoundTimersState,
} from "../../lib/reta/roundTimers";
import {
  bindRoundTimerAudioUnlock,
  playRoundTimerEndedSound,
  unlockRoundTimerAudio,
} from "../../lib/reta/roundTimerSound";

type RoundTimerPublicProps = {
  round: number;
  timers: RoundTimersState;
  className?: string;
};

/**
 * Tiempo restante en vista pública.
 * Activo: reloj. Al llegar a 0: mensaje + alerta sonora.
 */
export const RoundTimerPublic: React.FC<RoundTimerPublicProps> = ({
  round,
  timers,
  className = "",
}) => {
  const entry = timers.rounds[roundTimerKey(round)];
  const [nowMs, setNowMs] = useState(() => Date.now());
  const soundedForEndsAtRef = useRef<string | null>(null);

  const defined = hasRoundTimer(entry);
  const active = isRoundTimerActive(entry, nowMs);
  const clock = formatRemainingClock(entry, nowMs);
  const expired = defined && !active;

  useEffect(() => {
    bindRoundTimerAudioUnlock();
  }, []);

  useEffect(() => {
    if (!defined) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [defined, entry?.endsAt]);

  // Disparo puntual al vencer endsAt (más fiable que solo el tick de UI).
  useEffect(() => {
    if (!entry?.endsAt) return;
    const end = Date.parse(entry.endsAt);
    if (!Number.isFinite(end)) return;

    const fire = () => {
      if (soundedForEndsAtRef.current === entry.endsAt) return;
      soundedForEndsAtRef.current = entry.endsAt;
      playRoundTimerEndedSound();
      setNowMs(Date.now());
    };

    const msLeft = end - Date.now();
    if (msLeft <= 0) {
      // Si el componente monta ya vencido, no alertar de nuevo.
      return;
    }

    const id = window.setTimeout(fire, msLeft + 40);
    return () => window.clearTimeout(id);
  }, [entry?.endsAt]);

  // Respaldo: si el timeout se perdió (pestaña en segundo plano) y cruzamos a expired.
  useEffect(() => {
    if (!expired || !entry?.endsAt) return;
    if (soundedForEndsAtRef.current === entry.endsAt) return;
    // Solo si acabamos de cruzar (no si cargamos la página ya en 0:00).
    const end = Date.parse(entry.endsAt);
    if (!Number.isFinite(end)) return;
    if (Date.now() - end > 2_500) return;
    soundedForEndsAtRef.current = entry.endsAt;
    playRoundTimerEndedSound();
  }, [expired, entry?.endsAt]);

  if (!defined || !clock) return null;

  return (
    <span
      className={`round-timer-pub${expired ? " is-expired" : " is-live"} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-label={expired ? "El juego ha terminado" : `${clock} restantes`}
      title="Toca la pantalla una vez para activar el sonido de fin de ronda"
      onPointerDown={unlockRoundTimerAudio}
    >
      <span className="round-timer-pub__dot" aria-hidden />
      {expired ? (
        <span className="round-timer-pub__msg">El juego ha terminado</span>
      ) : (
        <span className="round-timer-pub__clock">{clock}</span>
      )}
    </span>
  );
};

export default RoundTimerPublic;
