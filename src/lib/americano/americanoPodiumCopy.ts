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
    tagline: "",
    headline: "Cuadro de honor",
    title: event === "la reta" ? "Americano" : event,
    statusBadge: "Americano finalizado",
    message: "¡Felicidades a los tres primeros lugares!",
  };
}
