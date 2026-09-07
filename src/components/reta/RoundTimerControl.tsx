import React, { useEffect, useId, useRef, useState } from "react";
import {
  formatRemainingClock,
  isRoundTimerActive,
  ROUND_TIMER_PRESETS,
  roundTimerKey,
  type RoundTimerEntry,
  type RoundTimersState,
} from "../../lib/reta/roundTimers";
import {
  clearRoundTimer,
  startRoundTimer,
} from "../../lib/reta/roundTimersApi";

type RoundTimerControlProps = {
  tournamentId: string;
  round: number;
  timers: RoundTimersState;
  onTimersChange: (next: RoundTimersState) => void;
};

/**
 * Control organizer: click → elige minutos → cuenta regresiva.
 * Persiste ends_at para la vista pública.
 */
export const RoundTimerControl: React.FC<RoundTimerControlProps> = ({
  tournamentId,
  round,
  timers,
  onTimersChange,
}) => {
  const entry: RoundTimerEntry | undefined =
    timers.rounds[roundTimerKey(round)];
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const [customMins, setCustomMins] = useState("20");
  const [busy, setBusy] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const active = isRoundTimerActive(entry, nowMs);
  const clock = formatRemainingClock(entry, nowMs);
  const expired = Boolean(entry?.endsAt) && !active;

  useEffect(() => {
    if (!entry?.endsAt) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [entry?.endsAt]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (ev: MouseEvent) => {
      if (!rootRef.current?.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const start = async (mins: number) => {
    if (busy || mins < 1) return;
    setBusy(true);
    try {
      const next = await startRoundTimer(tournamentId, round, mins, timers);
      onTimersChange(next);
      setOpen(false);
      setNowMs(Date.now());
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await clearRoundTimer(tournamentId, round, timers);
      onTimersChange(next);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="round-timer" ref={rootRef}>
      <button
        type="button"
        className={`round-timer__trigger${active ? " is-live" : ""}${
          expired ? " is-expired" : ""
        }${open ? " is-open" : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        title={
          expired
            ? "Tiempo agotado — clic para reiniciar"
            : active
              ? "Tiempo de ronda — clic para ajustar"
              : "Definir minutos de juego de esta ronda"
        }
      >
        <span className="round-timer__icon" aria-hidden>
          ◷
        </span>
        <span className="round-timer__label">
          {clock ?? "Tiempo"}
        </span>
      </button>

      {open ? (
        <div
          id={panelId}
          className="round-timer__panel"
          role="dialog"
          aria-label={`Tiempo de ronda ${round}`}
        >
          <p className="round-timer__panel-title">Minutos de juego</p>
          <div className="round-timer__presets">
            {ROUND_TIMER_PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                className="round-timer__preset"
                disabled={busy}
                onClick={() => void start(m)}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="round-timer__custom">
            <input
              type="number"
              min={1}
              max={180}
              className="round-timer__input"
              value={customMins}
              aria-label="Minutos personalizados"
              onChange={(e) => setCustomMins(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void start(Number(customMins) || 20);
                }
              }}
            />
            <button
              type="button"
              className="round-timer__start"
              disabled={busy}
              onClick={() => void start(Number(customMins) || 20)}
            >
              Iniciar
            </button>
          </div>
          {entry ? (
            <button
              type="button"
              className="round-timer__stop"
              disabled={busy}
              onClick={() => void stop()}
            >
              Detener
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default RoundTimerControl;
