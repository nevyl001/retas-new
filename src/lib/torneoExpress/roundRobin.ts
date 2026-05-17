/** Genera enfrentamientos round robin: cada pareja juega una vez contra cada otra del grupo. */
export function generateRoundRobinMatchups(
  pairIds: string[]
): Array<{ localId: string; visitanteId: string }> {
  const ids = [...pairIds];
  const matches: Array<{ localId: string; visitanteId: string }> = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      matches.push({ localId: ids[i], visitanteId: ids[j] });
    }
  }
  return matches;
}

export function expectedMatchCount(pairCount: number): number {
  if (pairCount < 2) return 0;
  return (pairCount * (pairCount - 1)) / 2;
}
