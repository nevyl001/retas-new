import type { TorneoExpressPartido } from "./types";

export interface BalancedRoundRobinMatchup {
  localId: string;
  visitanteId: string;
  ronda: number;
  orden: number;
}

/**
 * Round robin circular: reparte enfrentamientos por rondas para que
 * ninguna pareja juegue dos veces seguidas cuando hay 4+ equipos.
 */
export function generateBalancedRoundRobin(
  pairIds: string[]
): BalancedRoundRobinMatchup[] {
  const n = pairIds.length;
  if (n < 2) return [];

  const lista: (string | null)[] = [...pairIds];
  if (n % 2 !== 0) lista.push(null);

  const total = lista.length;
  const rondas = total - 1;
  const mitad = total / 2;
  const partidos: BalancedRoundRobinMatchup[] = [];
  let orden = 1;

  const working = [...lista];

  for (let ronda = 0; ronda < rondas; ronda++) {
    for (let i = 0; i < mitad; i++) {
      const pareja1 = working[i];
      const pareja2 = working[total - 1 - i];
      if (pareja1 && pareja2) {
        partidos.push({
          localId: pareja1,
          visitanteId: pareja2,
          ronda: ronda + 1,
          orden,
        });
        orden += 1;
      }
    }

    if (ronda < rondas - 1) {
      const rotated = working.slice(1);
      const last = rotated.pop();
      if (last !== undefined) rotated.unshift(last);
      working.splice(0, working.length, working[0], ...rotated);
    }
  }

  return partidos;
}

/** @deprecated Use generateBalancedRoundRobin for scheduling order. */
export function generateRoundRobinMatchups(
  pairIds: string[]
): Array<{ localId: string; visitanteId: string }> {
  return generateBalancedRoundRobin(pairIds).map(
    ({ localId, visitanteId }) => ({ localId, visitanteId })
  );
}

export function expectedMatchCount(pairCount: number): number {
  if (pairCount < 2) return 0;
  return (pairCount * (pairCount - 1)) / 2;
}

export function sortPartidosByOrden(
  partidos: TorneoExpressPartido[]
): TorneoExpressPartido[] {
  return [...partidos].sort((a, b) => {
    const oa = a.orden ?? 0;
    const ob = b.orden ?? 0;
    const hasOrden = oa > 0 || ob > 0;
    if (hasOrden && oa !== ob) return oa - ob;
    if (a.ronda != null && b.ronda != null && a.ronda !== b.ronda) {
      return a.ronda - b.ronda;
    }
    return a.created_at.localeCompare(b.created_at);
  });
}

export function groupPartidosByRonda(
  partidos: TorneoExpressPartido[],
  options?: { preserveListOrder?: boolean }
): Array<{ ronda: number; items: TorneoExpressPartido[] }> {
  if (options?.preserveListOrder) {
    if (partidos.length === 0) return [];
    const hasRonda = partidos.some((p) => p.ronda != null && p.ronda > 0);
    if (!hasRonda) return [{ ronda: 1, items: [...partidos] }];

    const groups: Array<{ ronda: number; items: TorneoExpressPartido[] }> = [];
    let currentRonda = partidos[0]?.ronda ?? 1;
    let bucket: TorneoExpressPartido[] = [];

    for (const p of partidos) {
      const r = p.ronda ?? currentRonda;
      if (bucket.length > 0 && r !== currentRonda) {
        groups.push({ ronda: currentRonda, items: bucket });
        bucket = [];
      }
      currentRonda = r;
      bucket.push(p);
    }
    if (bucket.length) groups.push({ ronda: currentRonda, items: bucket });
    return groups;
  }

  const sorted = sortPartidosByOrden(partidos);
  const hasRonda = sorted.some((p) => p.ronda != null && p.ronda > 0);
  if (!hasRonda) {
    return sorted.length
      ? [{ ronda: 1, items: sorted }]
      : [];
  }

  const groups: Array<{ ronda: number; items: TorneoExpressPartido[] }> = [];
  let currentRonda = sorted[0]?.ronda ?? 1;
  let bucket: TorneoExpressPartido[] = [];

  for (const p of sorted) {
    const r = p.ronda ?? currentRonda;
    if (bucket.length > 0 && r !== currentRonda) {
      groups.push({ ronda: currentRonda, items: bucket });
      bucket = [];
    }
    currentRonda = r;
    bucket.push(p);
  }
  if (bucket.length) groups.push({ ronda: currentRonda, items: bucket });

  return groups;
}

function matchupKey(p: TorneoExpressPartido): string {
  const pairIds = [p.pareja_local_id, p.pareja_visitante_id].sort().join("|");
  return `${p.grupo_id}:${pairIds}`;
}

function pickPreferredPartido(
  a: TorneoExpressPartido,
  b: TorneoExpressPartido
): TorneoExpressPartido {
  if (a.estado === "jugado" && b.estado !== "jugado") return a;
  if (b.estado === "jugado" && a.estado !== "jugado") return b;
  const oa = a.orden ?? 9999;
  const ob = b.orden ?? 9999;
  if (oa !== ob) return oa < ob ? a : b;
  return a.created_at.localeCompare(b.created_at) <= 0 ? a : b;
}

/** Quita filas repetidas (mismo id o mismo enfrentamiento en el grupo). */
export function dedupePartidosExpress(
  partidos: TorneoExpressPartido[]
): TorneoExpressPartido[] {
  const byId = new Map<string, TorneoExpressPartido>();
  for (const p of partidos) {
    if (!byId.has(p.id)) byId.set(p.id, p);
  }

  const byMatchup = new Map<string, TorneoExpressPartido>();
  Array.from(byId.values()).forEach((p) => {
    const key = matchupKey(p);
    const prev = byMatchup.get(key);
    byMatchup.set(key, prev ? pickPreferredPartido(prev, p) : p);
  });

  return sortPartidosByOrden(Array.from(byMatchup.values()));
}
