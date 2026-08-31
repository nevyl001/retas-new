/**
 * Copy de celebración para podio público Americano (top 3).
 */

export type AmericanoPodiumCelebration = {
  tagline: string;
  headline: string;
  title: string;
  message: string;
  statusBadge: string;
};

export function buildAmericanoPodiumCelebration(
  eventName?: string | null
): AmericanoPodiumCelebration {
  const event = eventName?.trim() || "la reta";
  return {
    tagline: "Demuestra tu nivel.",
    headline: "¡Felicidades!",
    title: "Los 3 primeros lugares",
    statusBadge: "Americano finalizado",
    message: `Top 3 de ${event}. Sigue compitiendo en Riviera Open y demuestra tu nivel.`,
  };
}
