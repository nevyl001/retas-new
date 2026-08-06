/**
 * Campo «Grupos» (2–8) en Crear Torneo Express.
 *
 * No forzar el mínimo en cada tecla: en móvil `Number("") || 2` dejaba el 2
 * imposible de borrar y al escribir otro dígito quedaba «23».
 */

export type NumGruposDraft = number | "";

export function clampNumGrupos(value: number): number {
  if (!Number.isFinite(value)) return 2;
  return Math.max(2, Math.min(8, Math.trunc(value)));
}

/** Grupos efectivos para armar assignments mientras el input puede estar vacío. */
export function resolveNumGrupos(draft: NumGruposDraft): number {
  if (draft === "") return 2;
  return clampNumGrupos(draft);
}

/**
 * Interpreta el value del input type=number.
 * "" → borrador vacío (el usuario está editando).
 * null → valor no numérico (ignorar el evento).
 */
export function parseNumGruposInput(raw: string): NumGruposDraft | null {
  if (raw.trim() === "") return "";
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}
