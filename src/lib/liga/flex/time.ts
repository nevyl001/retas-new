export type FlexTimeInput = {
  rounds: number;
  roundMinutes: number;
  restMinutes: number;
  /** Minutos disponibles entre inicio y fin. Null si el horario no está cerrado. */
  availableMinutes?: number | null;
};

export type FlexTimeEstimate = {
  playMinutes: number;
  restMinutes: number;
  totalMinutes: number;
  fits: boolean | null;
  message: string;
};

export function estimateFlexJornada(input: FlexTimeInput): FlexTimeEstimate {
  const rounds = Math.max(0, Math.floor(input.rounds) || 0);
  const roundMinutes = Math.max(0, Math.floor(input.roundMinutes) || 0);
  const restEach = Math.max(0, Math.floor(input.restMinutes) || 0);
  const playMinutes = rounds * roundMinutes;
  const restMinutes = rounds > 1 ? (rounds - 1) * restEach : 0;
  const totalMinutes = playMinutes + restMinutes;
  const available = input.availableMinutes;
  const fits =
    available == null || !Number.isFinite(available) ? null : totalMinutes <= available;

  const clock = `${rounds} rondas × ${roundMinutes} min = ${playMinutes} min. ${Math.max(0, rounds - 1)} descansos × ${restEach} min = ${restMinutes} min. Duración estimada: ${totalMinutes} min.`;
  const message =
    fits === false
      ? `${clock} El horario disponible (${available} min) no alcanza. Ajusta rondas, duración, descansos u horario antes de generar.`
      : clock;

  return { playMinutes, restMinutes, totalMinutes, fits, message };
}

/** "19:00" / "21:00" → minutos. Null si falta uno de los dos. */
export function windowMinutes(inicio?: string | null, fin?: string | null): number | null {
  const a = clockToMinutes(inicio);
  const b = clockToMinutes(fin);
  if (a == null || b == null) return null;
  const span = b - a;
  return span > 0 ? span : null;
}

function clockToMinutes(value?: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}
