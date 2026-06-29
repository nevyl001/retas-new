/** Contexto del torneo para la leyenda de clasificación. */
export type StandingsHelpMode =
  | "express"
  | "americano"
  | "dual-meet"
  | "round-robin"
  | "remontada-final";

export function resolveRetaStandingsHelpMode(opts: {
  hasTeamStandings?: boolean;
  remontadaActiva?: boolean;
}): Exclude<StandingsHelpMode, "express" | "americano"> {
  if (opts.hasTeamStandings) return "dual-meet";
  if (opts.remontadaActiva) return "remontada-final";
  return "round-robin";
}

export function getStandingsSchedulingNoteText(mode: StandingsHelpMode): string {
  switch (mode) {
    case "dual-meet":
      return "En un dual meet cada equipo suma games y partidos de sus parejas; esta tabla ordena el marcador global por equipo.";
    case "round-robin":
      return "La tabla ordena el acumulado de la fase.";
    case "remontada-final":
      return "Esta tabla corresponde al round robin. La remontada final define al campeón entre los mejores clasificados.";
    case "americano":
      return "En el americano los emparejamientos rotan de forma equilibrada; la tabla solo ordena el acumulado.";
    case "express":
      return "En el torneo express la tabla ordena el acumulado de la fase de grupos.";
    default:
      return "La tabla ordena el acumulado del torneo.";
  }
}

export function getStandingsCompactSchedulingHint(
  mode: StandingsHelpMode
): string | null {
  switch (mode) {
    case "dual-meet":
      return "Dual meet · tabla por equipo";
    case "round-robin":
      return "Round robin";
    case "remontada-final":
      return "Round robin · remontada final aparte";
    case "americano":
      return "Americano · rotación equilibrada";
    case "express":
      return "Torneo express";
    default:
      return null;
  }
}

/** Palabras clave a resaltar en el párrafo contextual. */
export function getStandingsSchedulingNoteHighlights(
  mode: StandingsHelpMode
): string[] {
  switch (mode) {
    case "dual-meet":
      return ["dual meet"];
    case "round-robin":
      return ["round robin"];
    case "remontada-final":
      return ["round robin", "remontada final"];
    case "americano":
      return ["americano"];
    case "express":
      return ["torneo express"];
    default:
      return [];
  }
}
