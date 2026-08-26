/**
 * Lógica pura de cuenta regresiva para Reta por Equipos (sin React).
 * Usa el timestamp ISO de `programado_en` tal cual (misma base que eventScheduleStatus).
 */

export type CountdownPhase = "upcoming" | "live" | "finished" | "unknown";

export type CountdownDisplay = {
  phase: CountdownPhase;
  /** Copy principal: COMIENZA EN | EN VIVO | FINALIZADA */
  headline: string;
  /** Segmentos visuales, p.ej. ["01","27","42"] o ["01D","04H","27M"] */
  segments: string[] | null;
  /** Separador entre segmentos (":" o " : ") */
  separator: string;
};

function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

/**
 * ms restantes hasta start. Nunca negativo.
 * Si no hay start válido → null.
 */
export function computeCountdownRemainingMs(
  programadoEn: string | null | undefined,
  nowMs: number
): number | null {
  const iso = programadoEn?.trim();
  if (!iso) return null;
  const start = new Date(iso).getTime();
  if (!Number.isFinite(start)) return null;
  return Math.max(0, start - nowMs);
}

export function formatCountdownSegments(remainingMs: number): {
  segments: string[];
  separator: string;
} {
  const totalSec = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (days >= 1) {
    return {
      segments: [`${pad2(days)}D`, `${pad2(hours)}H`, `${pad2(minutes)}M`],
      separator: " : ",
    };
  }

  const totalHours = Math.floor(totalSec / 3600);
  return {
    segments: [pad2(totalHours), pad2(minutes), pad2(seconds)],
    separator: " : ",
  };
}

export function resolveCountdownDisplay(input: {
  programadoEn?: string | null;
  programadoHasta?: string | null;
  isFinished?: boolean | null;
  nowMs: number;
}): CountdownDisplay {
  if (input.isFinished) {
    return {
      phase: "finished",
      headline: "FINALIZADA",
      segments: null,
      separator: " : ",
    };
  }

  const startIso = input.programadoEn?.trim();
  if (!startIso) {
    return {
      phase: "unknown",
      headline: "EN VIVO",
      segments: null,
      separator: " : ",
    };
  }

  const startMs = new Date(startIso).getTime();
  if (!Number.isFinite(startMs)) {
    return {
      phase: "unknown",
      headline: "EN VIVO",
      segments: null,
      separator: " : ",
    };
  }

  const remaining = Math.max(0, startMs - input.nowMs);
  if (remaining > 0) {
    const formatted = formatCountdownSegments(remaining);
    return {
      phase: "upcoming",
      headline: "COMIENZA EN",
      segments: formatted.segments,
      separator: formatted.separator,
    };
  }

  const endIso = input.programadoHasta?.trim();
  const endMs = endIso ? new Date(endIso).getTime() : NaN;
  if (Number.isFinite(endMs) && input.nowMs > endMs) {
    return {
      phase: "finished",
      headline: "FINALIZADA",
      segments: null,
      separator: " : ",
    };
  }

  return {
    phase: "live",
    headline: "EN VIVO",
    segments: null,
    separator: " : ",
  };
}
