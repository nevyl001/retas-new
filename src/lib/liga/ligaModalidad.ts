/** Predicados de modalidad Liga — mantener aisladas las ramas de scoring/fixture. */

import type { LigaModalidad } from "./types";

export function isParejasFijasLegacy(m: LigaModalidad): boolean {
  return m === "parejas_fijas";
}

export function isParejasFijasPlayoffs(m: LigaModalidad): boolean {
  return m === "parejas_fijas_playoffs";
}

/** Modalidades con roster de equipos fijos (tabs Parejas, ranking equipos). */
export function isEquiposModalidad(m: LigaModalidad): boolean {
  return m === "parejas_fijas" || m === "parejas_fijas_playoffs";
}

export function parseLigaModalidad(raw: unknown): LigaModalidad {
  if (raw === "parejas_fijas") return "parejas_fijas";
  if (raw === "parejas_fijas_playoffs") return "parejas_fijas_playoffs";
  return "individual_rotativo";
}
