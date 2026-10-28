/**
 * Presentación pública de Gran Final (solo lectura).
 * Detección por fase/bracket_slot — no por número de jornada ni título.
 */

import type { LigaPartido } from "./types";
import {
  formatPartidoPublicScore,
  partidoMatchWinnerSide,
} from "./publicDisplay";

export type LigaGranFinalPresentationState =
  | "pending"
  | "live"
  | "champions";

export function isLigaGranFinalPartido(
  partido: Pick<LigaPartido, "fase" | "bracket_slot">
): boolean {
  if (partido.fase === "final") return true;
  const slot = (partido.bracket_slot ?? "").trim().toUpperCase();
  return slot === "FINAL";
}

export function findLigaGranFinalPartido(
  partidos: readonly LigaPartido[] | null | undefined
): LigaPartido | null {
  if (!partidos?.length) return null;
  return partidos.find(isLigaGranFinalPartido) ?? null;
}

export function jornadaHasLigaGranFinal(
  partidos: readonly LigaPartido[] | null | undefined
): boolean {
  return findLigaGranFinalPartido(partidos) != null;
}

export function resolveLigaGranFinalPresentationState(
  partido: Pick<LigaPartido, "estado" | "score_pareja1" | "score_pareja2" | "set_scores">,
  esParejasFijas: boolean
): LigaGranFinalPresentationState {
  if (partido.estado === "in_progress") return "live";
  if (partido.estado === "completed") {
    const winner = partidoMatchWinnerSide(partido, esParejasFijas);
    if (winner === 1 || winner === 2) return "champions";
  }
  return "pending";
}

export function ligaGranFinalScoreLabel(
  partido: Pick<
    LigaPartido,
    "estado" | "score_pareja1" | "score_pareja2" | "set_scores"
  >,
  esParejasFijas: boolean
): string | null {
  return formatPartidoPublicScore(partido, esParejasFijas);
}

/** Meta de cabecera desde partidos reales (no canchas_disponibles heredadas). */
export function ligaGranFinalHeroMeta(
  partidos: readonly LigaPartido[]
): string {
  const n = partidos.length;
  const canchas = new Set(
    partidos
      .map((p) => p.cancha)
      .filter((c): c is number => typeof c === "number" && Number.isFinite(c))
  );
  const canchaCount = Math.max(1, canchas.size || (n > 0 ? 1 : 0));
  return `${n} partido${n === 1 ? "" : "s"} · ${canchaCount} cancha${
    canchaCount === 1 ? "" : "s"
  }`;
}

/** Extrae etiqueta de temporada del nombre de liga si existe. */
export function ligaTemporadaLabelFromNombre(nombre: string): string | null {
  const m = nombre.match(/temporada\s*(\d+)/i);
  if (!m) return null;
  return `Temporada ${m[1]}`;
}

export function ligaGranFinalSubtitle(nombreLiga: string): string {
  const temporada = ligaTemporadaLabelFromNombre(nombreLiga);
  if (!temporada) return nombreLiga.trim();
  const base = nombreLiga
    .replace(/\s*[-–·]?\s*temporada\s*\d+/i, "")
    .trim();
  return base ? `${base} · ${temporada}` : temporada;
}
