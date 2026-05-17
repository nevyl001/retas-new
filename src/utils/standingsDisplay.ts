/** DIF = PTS FAV − PTS CON (siempre desde los totales mostrados en tabla). */
export function computeStandingDif(ptsFav: number, ptsCon: number): number {
  return ptsFav - ptsCon;
}

export function formatStandingDif(dif: number): string {
  if (dif > 0) return `+${dif}`;
  if (dif < 0) return `${dif}`;
  return "0";
}

export function standingDifCellClass(dif: number): string {
  if (dif > 0) return "standings-dif--pos";
  if (dif < 0) return "standings-dif--neg";
  return "standings-dif--zero";
}
