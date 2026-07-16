/**
 * Cancha de partido Round Robin (`matches.court`).
 * NULL canónico = «Por asignar». Nunca usar 0 / -1 como sentinel.
 */

export const UNASSIGNED_COURT_LABEL = "Por asignar";

export function isAssignedCourt(
  court: number | null | undefined
): court is number {
  return court != null && Number.isFinite(court) && court > 0;
}

export function formatMatchCourtLabel(
  court: number | null | undefined
): string {
  if (!isAssignedCourt(court)) return UNASSIGNED_COURT_LABEL;
  return `Cancha ${court}`;
}

/** Orden estable: canchas asignadas asc; NULL / sin asignar al final. */
export function compareMatchCourt(
  a: number | null | undefined,
  b: number | null | undefined
): number {
  const aOk = isAssignedCourt(a);
  const bOk = isAssignedCourt(b);
  if (!aOk && !bOk) return 0;
  if (!aOk) return 1;
  if (!bOk) return -1;
  return a - b;
}

export function maxAssignedCourt(
  courts: readonly (number | null | undefined)[]
): number {
  let max = 0;
  for (const c of courts) {
    if (isAssignedCourt(c) && c > max) max = c;
  }
  return max;
}
