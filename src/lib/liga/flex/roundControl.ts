import { FLEX_MAX_ROUNDS } from "./constants";

export type FlexRoundScore = {
  round: number;
  scoreA: number | null;
  scoreB: number | null;
};

/** Última ronda que ya tiene algún marcador. Cero si nadie ha capturado. */
export function flexScoredRoundFloor(matches: readonly FlexRoundScore[]): number {
  return matches.reduce((floor, match) => {
    if (match.scoreA == null && match.scoreB == null) return floor;
    return Math.max(floor, match.round);
  }, 0);
}

export function adjustFlexTarget(input: {
  current: number;
  next: number;
  matches: readonly FlexRoundScore[];
}): { ok: true } | { ok: false; error: string } {
  if (!Number.isInteger(input.next) || input.next < 1 || input.next > FLEX_MAX_ROUNDS) {
    return { ok: false, error: `Las rondas deben estar entre 1 y ${FLEX_MAX_ROUNDS}.` };
  }
  const floor = flexScoredRoundFloor(input.matches);
  if (input.next < floor) {
    return { ok: false, error: "No se puede bajar de las rondas que ya tienen marcador." };
  }
  const blocked = input.matches.some(
    (match) =>
      match.round > input.next && (match.scoreA != null || match.scoreB != null)
  );
  if (blocked) {
    return {
      ok: false,
      error: "Hay una ronda posterior con marcadores. No se elimina en silencio.",
    };
  }
  return { ok: true };
}

export function nextFlexRoundAction(input: {
  target: number;
  generatedRounds: readonly number[];
  confirmedRounds: readonly number[];
  matches: readonly FlexRoundScore[];
}):
  | { kind: "generate"; round: number }
  | { kind: "replace"; round: number }
  | { kind: "confirm"; round: number }
  | { kind: "blocked"; reason: string } {
  const generated = Array.from(new Set(input.generatedRounds)).sort((a, b) => a - b);
  const last = generated[generated.length - 1] ?? 0;
  const confirmed = new Set(input.confirmedRounds);
  const complete = (round: number) => {
    const ofRound = input.matches.filter((match) => match.round === round);
    return ofRound.length > 0 && ofRound.every((match) => match.scoreA != null && match.scoreB != null);
  };

  if (last === 0) {
    if (input.target < 1) return { kind: "blocked", reason: "Configura al menos una ronda." };
    return { kind: "generate", round: 1 };
  }

  const firstOpen = generated.find((round) => !complete(round) || !confirmed.has(round));
  if (firstOpen == null) {
    if (last >= input.target) {
      return { kind: "blocked", reason: "Sube el objetivo para generar otra ronda." };
    }
    if (last >= FLEX_MAX_ROUNDS) {
      return { kind: "blocked", reason: `Las rondas deben estar entre 1 y ${FLEX_MAX_ROUNDS}.` };
    }
    return { kind: "generate", round: last + 1 };
  }

  if (complete(firstOpen) && !confirmed.has(firstOpen)) {
    return { kind: "confirm", round: firstOpen };
  }
  if (firstOpen !== last) {
    return {
      kind: "blocked",
      reason: "Hay rondas futuras ya creadas. Baja el objetivo para retirar las que no tienen marcador.",
    };
  }

  const ofLast = input.matches.filter((match) => match.round === last);
  const anyScore = ofLast.some((match) => match.scoreA != null || match.scoreB != null);
  if (!anyScore) return { kind: "replace", round: last };
  return { kind: "blocked", reason: "Faltan marcadores de la ronda actual." };
}

/**
 * Cómo se puede tocar el marcador de la ronda que se está viendo.
 * - capture: ronda abierta. Se captura con Guardar.
 * - confirmed: ronda confirmada o jornada finalizada. Solo se cambia con
 *   Editar y una corrección con motivo.
 * - locked: la temporada ya tiene campeón. Solo lectura hasta reabrirla.
 */
export type FlexRoundEditMode = "capture" | "confirmed" | "locked";

export function flexRoundEditMode(input: {
  round: number | null;
  confirmedRounds: readonly number[];
  jornadaCompleted: boolean;
  seasonClosed: boolean;
}): FlexRoundEditMode {
  if (input.seasonClosed) return "locked";
  if (input.jornadaCompleted) return "confirmed";
  if (input.round != null && input.confirmedRounds.includes(input.round)) {
    return "confirmed";
  }
  return "capture";
}

export type FlexRoundAction = ReturnType<typeof nextFlexRoundAction>;

/** Ronda sobre la que actúa el botón principal (confirmar, regenerar o la última creada). */
export function flexActiveRound(
  action: FlexRoundAction | null,
  generatedRounds: readonly number[]
): number | null {
  if (action && (action.kind === "confirm" || action.kind === "replace")) {
    return action.round;
  }
  return generatedRounds.length > 0 ? Math.max(...generatedRounds) : null;
}

/**
 * La acción principal solo se muestra cuando se está viendo la ronda sobre la
 * que actúa. Confirmar la ronda 6 mientras se ve la 2 confundía qué se confirma.
 */
export function flexRoundActionVisible(
  action: FlexRoundAction | null,
  shownRound: number | null,
  generatedRounds: readonly number[]
): boolean {
  if (!action) return false;
  if (action.kind === "confirm" || action.kind === "replace") {
    return shownRound === action.round;
  }
  const last = generatedRounds.length > 0 ? Math.max(...generatedRounds) : null;
  return shownRound == null || shownRound === last;
}

export function resetFlexJornadaGuard(input: {
  seasonClosed: boolean;
  championJornada: boolean;
}): { ok: true } | { ok: false; error: string } {
  if (input.seasonClosed || input.championJornada) {
    return {
      ok: false,
      error: "La temporada ya tiene campeón. Reábrela antes de reiniciar esta jornada.",
    };
  }
  return { ok: true };
}
