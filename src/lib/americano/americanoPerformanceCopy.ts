/**
 * Copy de celebración para desempeño / share Americano (ganador #1).
 */

export type AmericanoWinnerCelebration = {
  headline: string;
  message: string;
  /** Líneas para composición en canvas (wrap controlado). */
  shareLines: string[];
};

export function buildAmericanoWinnerCelebration(
  eventName?: string | null
): AmericanoWinnerCelebration {
  const event = eventName?.trim() || "la reta";
  return {
    headline: "¡Felicidades, ganador!",
    message: `Campeón de ${event}. Sigue compitiendo en Riviera Open y demuestra tu nivel.`,
    shareLines: [
      "¡Felicidades, ganador!",
      `Campeón de ${event}.`,
      "Sigue compitiendo en Riviera Open",
      "y demuestra tu nivel.",
    ],
  };
}

export function isAmericanoWinnerPlacement(input: {
  position: number;
  isFinished: boolean;
}): boolean {
  return input.isFinished && Math.max(1, Math.floor(input.position)) === 1;
}
