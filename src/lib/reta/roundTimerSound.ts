/**
 * Alerta sonora al terminar el tiempo de ronda.
 * Usa un AudioContext compartido + resume (los navegadores bloquean
 * audio hasta haber interacción del usuario en la página).
 */

type AudioContextConstructor = typeof AudioContext;

let sharedCtx: AudioContext | null = null;
let unlockBound = false;

function getAudioContextCtor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: AudioContextConstructor })
      .webkitAudioContext ||
    null
  );
}

function getAudioContext(): AudioContext | null {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return null;
  if (!sharedCtx || sharedCtx.state === "closed") {
    try {
      sharedCtx = new Ctor();
    } catch {
      return null;
    }
  }
  return sharedCtx;
}

/** Desbloquea audio tras un gesto del usuario (clic / tecla / touch). */
export function unlockRoundTimerAudio(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => undefined);
  }
}

/** Escucha gestos globales una sola vez para poder sonar al llegar a 0. */
export function bindRoundTimerAudioUnlock(): void {
  if (typeof window === "undefined" || unlockBound) return;
  unlockBound = true;
  const unlock = () => unlockRoundTimerAudio();
  for (const ev of ["pointerdown", "touchstart", "keydown", "click"] as const) {
    window.addEventListener(ev, unlock, { capture: true, passive: true });
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") unlockRoundTimerAudio();
  });
}

function scheduleBeeps(ctx: AudioContext): void {
  const now = ctx.currentTime;
  // 4 pitidos fuertes (alerta de fin de ronda)
  const pattern = [
    { freq: 880, at: 0, dur: 0.2 },
    { freq: 880, at: 0.28, dur: 0.2 },
    { freq: 660, at: 0.56, dur: 0.2 },
    { freq: 990, at: 0.9, dur: 0.45 },
  ];

  for (const note of pattern) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(note.freq, now + note.at);
    gain.gain.setValueAtTime(0.0001, now + note.at);
    gain.gain.linearRampToValueAtTime(0.42, now + note.at + 0.015);
    gain.gain.linearRampToValueAtTime(0.0001, now + note.at + note.dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + note.at);
    osc.stop(now + note.at + note.dur + 0.03);
  }

  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.([180, 80, 180, 80, 320]);
    }
  } catch {
    /* ignore */
  }
}

/** Reproduce la alerta (tras resume si el contexto estaba suspendido). */
export function playRoundTimerEndedSound(): void {
  bindRoundTimerAudioUnlock();
  const ctx = getAudioContext();
  if (!ctx) return;

  const run = () => {
    try {
      scheduleBeeps(ctx);
    } catch {
      /* ignore */
    }
  };

  if (ctx.state === "suspended") {
    void ctx
      .resume()
      .then(() => {
        if (ctx.state === "running") run();
      })
      .catch(() => undefined);
    return;
  }
  run();
}
