/**
 * Rating mostrado en clasificación pública de liga.
 *
 * - `liga_jugadores.nivel` = rating al ingresar a la liga (histórico verificable).
 * - `riviera_jugadores.rating` = rating actual del club (no afirmar como original).
 */

export type LigaPublicRatingSource = "original" | "current" | "none";

export type LigaPublicPlayerRating = {
  value: number | null;
  source: LigaPublicRatingSource;
  /** Etiqueta corta para UI. */
  label: string;
};

export function resolveLigaPublicPlayerRating(
  nivel: number | null | undefined,
  rivieraRating: number | null | undefined
): LigaPublicPlayerRating {
  if (nivel != null && Number.isFinite(Number(nivel))) {
    return {
      value: Number(nivel),
      source: "original",
      label: "RATING ORIGINAL",
    };
  }
  if (rivieraRating != null && Number.isFinite(Number(rivieraRating))) {
    return {
      value: Number(rivieraRating),
      source: "current",
      label: "RATING",
    };
  }
  return {
    value: null,
    source: "none",
    label: "Sin rating registrado",
  };
}

export function formatLigaPublicRatingValue(value: number): string {
  return value.toFixed(2);
}
