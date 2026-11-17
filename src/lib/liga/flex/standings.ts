import { flexPointsForPosition } from "./constants";

export type FlexPlayerRef = { id: string; name: string };

export type FlexScoredMatch = {
  round: number;
  pairA: [string, string];
  pairB: [string, string];
  scoreA: number | null;
  scoreB: number | null;
};

export type FlexJornadaStanding = {
  jugadorId: string;
  nombre: string;
  posicion: number;
  puntos: number;
  partidos: number;
  gamesFavor: number;
  gamesContra: number;
  promedioGf: number;
  promedioDif: number;
};

export type FlexJornadaRankResult =
  | { ok: true; rows: FlexJornadaStanding[] }
  | {
      ok: false;
      reason: string;
      ties: string[][];
    };

type Acc = {
  id: string;
  name: string;
  partidos: number;
  gf: number;
  gc: number;
  h2hGf: Map<string, number>;
  h2hGc: Map<string, number>;
};

/**
 * Todos juegan los mismos partidos, así que se ordena por games ganados y
 * luego por diferencia. El nombre y el id no desempata.
 */
export function rankFlexJornada(input: {
  players: readonly FlexPlayerRef[];
  matches: readonly FlexScoredMatch[];
  /** Orden explícito, solo dentro de un grupo que el criterio deportivo no separa. */
  resolution?: readonly string[];
}): FlexJornadaRankResult {
  const ids = input.players.map((p) => p.id);
  if (new Set(ids).size !== ids.length) {
    return { ok: false, reason: "Hay un jugador repetido en la jornada.", ties: [] };
  }
  if (input.matches.some((m) => m.scoreA == null || m.scoreB == null)) {
    return {
      ok: false,
      reason: "Faltan marcadores para cerrar la jornada.",
      ties: [],
    };
  }

  const byId = new Map<string, Acc>();
  for (const p of input.players) {
    byId.set(p.id, {
      id: p.id,
      name: p.name,
      partidos: 0,
      gf: 0,
      gc: 0,
      h2hGf: new Map(),
      h2hGc: new Map(),
    });
  }

  for (const match of input.matches) {
    const scoreA = match.scoreA as number;
    const scoreB = match.scoreB as number;
    const sides: Array<{ ids: [string, string]; gf: number; gc: number }> = [
      { ids: match.pairA, gf: scoreA, gc: scoreB },
      { ids: match.pairB, gf: scoreB, gc: scoreA },
    ];
    for (const side of sides) {
      for (const id of side.ids) {
        const acc = byId.get(id);
        if (!acc) {
          return {
            ok: false,
            reason: "Un partido incluye a alguien que no está en la jornada.",
            ties: [],
          };
        }
        acc.partidos += 1;
        acc.gf += side.gf;
        acc.gc += side.gc;
      }
    }
    for (const a of match.pairA) {
      for (const b of match.pairB) {
        addH2h(byId.get(a)!, b, scoreA, scoreB);
        addH2h(byId.get(b)!, a, scoreB, scoreA);
      }
    }
  }

  const people = Array.from(byId.values());
  if (people.some((p) => p.partidos < 1)) {
    return {
      ok: false,
      reason: "Hay un participante sin partidos. No se puede asignar posición.",
      ties: [],
    };
  }

  const ordered = orderWithResolution(people, input.resolution);
  if (!ordered.ok) return ordered;

  return {
    ok: true,
    rows: ordered.rows.map((acc, index) => {
      const posicion = index + 1;
      return {
        jugadorId: acc.id,
        nombre: acc.name,
        posicion,
        puntos: flexPointsForPosition(posicion),
        partidos: acc.partidos,
        gamesFavor: acc.gf,
        gamesContra: acc.gc,
        promedioGf: acc.gf / acc.partidos,
        promedioDif: (acc.gf - acc.gc) / acc.partidos,
      };
    }),
  };
}

function addH2h(acc: Acc, rivalId: string, gf: number, gc: number): void {
  acc.h2hGf.set(rivalId, (acc.h2hGf.get(rivalId) ?? 0) + gf);
  acc.h2hGc.set(rivalId, (acc.h2hGc.get(rivalId) ?? 0) + gc);
}

function compareSport(a: Acc, b: Acc): number {
  if (a.gf !== b.gf) return b.gf - a.gf;
  const diffA = a.gf - a.gc;
  const diffB = b.gf - b.gc;
  if (diffA !== diffB) return diffB - diffA;
  const aGf = a.h2hGf.get(b.id) ?? 0;
  const bGf = b.h2hGf.get(a.id) ?? 0;
  const aGc = a.h2hGc.get(b.id) ?? 0;
  const bGc = b.h2hGc.get(a.id) ?? 0;
  if (aGf + aGc > 0 || bGf + bGc > 0) {
    const aDiff = aGf - aGc;
    const bDiff = bGf - bGc;
    if (aDiff !== bDiff) return bDiff - aDiff;
  }
  return 0;
}

function sameSport(a: Acc, b: Acc): boolean {
  return compareSport(a, b) === 0 && compareSport(b, a) === 0;
}

function orderWithResolution(
  people: Acc[],
  resolution?: readonly string[]
): { ok: true; rows: Acc[] } | { ok: false; reason: string; ties: string[][] } {
  const remaining = [...people];
  const rows: Acc[] = [];
  const ties: string[][] = [];
  const resolved = new Map<string, number>();
  (resolution ?? []).forEach((id, index) => resolved.set(id, index));

  while (remaining.length > 0) {
    let best = remaining[0]!;
    for (const candidate of remaining.slice(1)) {
      if (compareSport(candidate, best) < 0) best = candidate;
    }
    const group = remaining.filter((p) => sameSport(p, best) && sameSport(best, p));
    if (group.length > 1) {
      const known = group.every((p) => resolved.has(p.id));
      if (!known) {
        ties.push(group.map((p) => p.id));
        return {
          ok: false,
          reason:
            "Hay un empate que cambia los puntos. Hace falta una resolución deportiva explícita antes del cierre.",
          ties,
        };
      }
      group.sort((a, b) => (resolved.get(a.id) ?? 0) - (resolved.get(b.id) ?? 0));
    }
    for (const member of group) {
      rows.push(member);
      const index = remaining.findIndex((p) => p.id === member.id);
      remaining.splice(index, 1);
    }
  }

  return { ok: true, rows };
}
