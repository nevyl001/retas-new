import { deserializeBracketSlots } from "./bracketPersistence";
import type { TorneoExpressBundle } from "./types";

export function buildEliminatoriaLabelMap(
  bundle: TorneoExpressBundle
): Record<string, string> {
  const map: Record<string, string> = {};

  Object.values(bundle.parejasPorGrupo).forEach((parejas) => {
    parejas.forEach((p) => {
      if (p.pareja_display) map[p.pareja_id] = p.pareja_display;
    });
  });

  const slots = deserializeBracketSlots(bundle.torneo.bracket_slots);
  slots.forEach((s) => {
    if (s.type === "team") {
      map[s.qualifier.parejaId] = s.qualifier.parejaLabel;
    }
  });

  return map;
}

export function parejaLabelFromMap(
  map: Record<string, string>,
  parejaId: string | null | undefined
): string {
  if (!parejaId) return "—";
  return map[parejaId] ?? parejaId.slice(0, 8);
}
