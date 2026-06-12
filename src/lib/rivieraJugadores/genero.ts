/** Género en registro Riviera Open (ranking varonil / femenil). */
export type RivieraJugadorGenero = "M" | "F";

export const RIVIERA_GENERO_ORDER: RivieraJugadorGenero[] = ["M", "F"];

export const RIVIERA_GENERO_LABELS: Record<RivieraJugadorGenero, string> = {
  M: "Varonil",
  F: "Femenil",
};

export const RIVIERA_GENERO_REGISTRY_TITLE: Record<RivieraJugadorGenero, string> = {
  M: "jugadores",
  F: "jugadoras",
};

export const RIVIERA_GENERO_RANKING_TITLE: Record<RivieraJugadorGenero, string> = {
  M: "Ranking de jugadores",
  F: "Ranking de jugadoras",
};

export const RIVIERA_GENERO_NEW_LABEL: Record<RivieraJugadorGenero, string> = {
  M: "Nuevo jugador",
  F: "Nueva jugadora",
};

export function normalizeRivieraGenero(
  value: string | null | undefined
): RivieraJugadorGenero | null {
  const v = value?.trim().toUpperCase();
  if (v === "M" || v === "MASCULINO" || v === "VARONIL") return "M";
  if (v === "F" || v === "FEMENINO" || v === "FEMENIL") return "F";
  return null;
}

export function parseRivieraGeneroFromPath(
  segment: string | null | undefined
): RivieraJugadorGenero | null {
  if (!segment) return null;
  const s = segment.trim().toLowerCase();
  if (s === "m" || s === "varonil" || s === "masculino") return "M";
  if (s === "f" || s === "femenil" || s === "femenino") return "F";
  return null;
}

/** Legacy sin género → varonil (compatibilidad). */
export function isJugadorInGeneroBracket(
  genero: string | null | undefined,
  bracket: RivieraJugadorGenero
): boolean {
  const g = normalizeRivieraGenero(genero);
  if (bracket === "M") return g === null || g === "M";
  return g === "F";
}
