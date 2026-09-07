/**
 * Chime corto al terminar el tiempo de ronda (Web Audio, sin asset).
 * Los navegadores pueden silenciarlo hasta que haya interacción del usuario.
 */
export function playRoundTimerEndedSound(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    // Tres tonos descendentes: aviso claro de fin de juego
    const notes = [
      { freq: 880, at: 0, dur: 0.22 },
      { freq: 659.25, at: 0.18, dur: 0.22 },
      { freq: 523.25, at: 0.36, dur: 0.45 },
    ];

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(note.freq, now + note.at);
      gain.gain.setValueAtTime(0.0001, now + note.at);
      gain.gain.exponentialRampToValueAtTime(0.22, now + note.at + 0.02);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + note.at + note.dur
      );
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + note.at);
      osc.stop(now + note.at + note.dur + 0.02);
    }

    window.setTimeout(() => {
      void ctx.close();
    }, 1200);
  } catch {
    /* autoplay / AudioContext no disponible */
  }
}
