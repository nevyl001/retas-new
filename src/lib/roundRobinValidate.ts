/**
 * Validador único del calendario round-robin con cupo de canchas.
 * Tests y persistencia deben usar SOLO esta función.
 */

export type ScheduleSlotLike = {
  pair1Id: string;
  pair2Id: string;
  round: number;
  court?: number | null;
};

export type PairIdSource = string | { id: string };

function resolvePairIds(pairs: PairIdSource[]): string[] {
  return pairs.map((p) => (typeof p === "string" ? p : p.id));
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** N(N-1)/2 enfrentamientos y ceil(partidos/C) rondas esperadas. */
export function expectedRoundRobinTotals(
  pairCount: number,
  courts: number
): { matches: number; rounds: number; courts: number } {
  const n = Math.max(0, pairCount);
  const c = Math.max(1, Math.floor(courts) || 1);
  const matches = (n * (n - 1)) / 2;
  const rounds = matches === 0 ? 0 : Math.ceil(matches / c);
  return { matches, rounds, courts: c };
}

/**
 * Devuelve lista de errores (vacía = válido).
 * Reglas estrictas de descansos (exactamente 3, sin consecutivos, R10)
 * solo se exigen para 8 parejas / 3 canchas.
 */
export function validateSchedule(
  schedule: ScheduleSlotLike[],
  pairs: PairIdSource[],
  courts: number
): string[] {
  const errors: string[] = [];
  const pairIds = resolvePairIds(pairs);
  const pairSet = new Set(pairIds);
  const n = pairIds.length;
  const c = Math.max(1, Math.floor(courts) || 1);
  const { matches: expectedMatches, rounds: expectedRounds } =
    expectedRoundRobinTotals(n, c);

  if (n < 2) {
    if (schedule.length > 0) {
      errors.push("Con menos de 2 parejas no debe haber partidos.");
    }
    return errors;
  }

  if (schedule.length !== expectedMatches) {
    errors.push(
      `Se esperaban ${expectedMatches} partidos únicos; hay ${schedule.length}.`
    );
  }

  const edgeCounts = new Map<string, number>();
  const byRound = new Map<number, ScheduleSlotLike[]>();
  const plays = new Map<string, number>();
  for (const id of pairIds) plays.set(id, 0);

  for (const m of schedule) {
    if (!pairSet.has(m.pair1Id) || !pairSet.has(m.pair2Id)) {
      errors.push(
        `Partido con pareja desconocida: ${m.pair1Id} vs ${m.pair2Id}.`
      );
      continue;
    }
    if (m.pair1Id === m.pair2Id) {
      errors.push(`Partido inválido: la pareja ${m.pair1Id} juega contra sí misma.`);
      continue;
    }
    if (!Number.isFinite(m.round) || m.round < 1) {
      errors.push(`Ronda inválida (${m.round}) en ${m.pair1Id} vs ${m.pair2Id}.`);
    }
    const key = edgeKey(m.pair1Id, m.pair2Id);
    edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    plays.set(m.pair1Id, (plays.get(m.pair1Id) ?? 0) + 1);
    plays.set(m.pair2Id, (plays.get(m.pair2Id) ?? 0) + 1);
    const list = byRound.get(m.round) ?? [];
    list.push(m);
    byRound.set(m.round, list);
  }

  for (const [key, count] of Array.from(edgeCounts.entries())) {
    if (count !== 1) {
      errors.push(`Enfrentamiento duplicado o repetido (${count}×): ${key}.`);
    }
  }

  // Todas las aristas de K_n deben existir exactamente una vez.
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const key = edgeKey(pairIds[i], pairIds[j]);
      if ((edgeCounts.get(key) ?? 0) !== 1) {
        errors.push(`Falta el enfrentamiento ${pairIds[i]} vs ${pairIds[j]}.`);
      }
    }
  }

  for (const id of pairIds) {
    const played = plays.get(id) ?? 0;
    if (played !== n - 1) {
      errors.push(
        `La pareja ${id} juega ${played} partidos; debe jugar ${n - 1}.`
      );
    }
  }

  const roundNums = Array.from(byRound.keys()).sort((a, b) => a - b);
  if (roundNums.length !== expectedRounds) {
    errors.push(
      `Se esperaban ${expectedRounds} rondas; hay ${roundNums.length}.`
    );
  }
  for (let r = 1; r <= expectedRounds; r += 1) {
    if (!byRound.has(r)) {
      errors.push(`Falta la ronda ${r}.`);
    }
  }

  const isEightThree = n === 8 && c === 3;

  for (const r of roundNums) {
    const roundMatches = byRound.get(r) ?? [];
    if (roundMatches.length > c) {
      errors.push(
        `Ronda ${r} tiene ${roundMatches.length} partidos; máximo ${c} canchas.`
      );
    }

    const isLast = r === expectedRounds;
    if (!isLast && roundMatches.length !== c) {
      errors.push(
        `Ronda ${r} debe llenar ${c} canchas; tiene ${roundMatches.length} partidos.`
      );
    }
    if (isLast) {
      const expectedLast = expectedMatches - c * (expectedRounds - 1);
      if (roundMatches.length !== expectedLast) {
        errors.push(
          `Última ronda debe tener ${expectedLast} partido(s); tiene ${roundMatches.length}.`
        );
      }
    }

    if (isEightThree) {
      if (r <= 9 && roundMatches.length !== 3) {
        errors.push(`Con 8/3, R${r} debe tener exactamente 3 partidos.`);
      }
      if (r === 10 && roundMatches.length !== 1) {
        errors.push("Con 8/3, R10 debe tener exactamente 1 partido.");
      }
    }

    const used = new Set<string>();
    const courtsUsed = new Set<number>();
    for (const m of roundMatches) {
      if (used.has(m.pair1Id) || used.has(m.pair2Id)) {
        errors.push(
          `Pareja repetida en ronda ${r}: ${m.pair1Id} / ${m.pair2Id}.`
        );
      }
      used.add(m.pair1Id);
      used.add(m.pair2Id);
      if (m.court != null) {
        if (courtsUsed.has(m.court)) {
          errors.push(`Cancha ${m.court} duplicada en ronda ${r}.`);
        }
        courtsUsed.add(m.court);
      }
    }
  }

  if (isEightThree && expectedRounds === 10) {
    const restsByRound: string[][] = [];
    for (let r = 1; r <= 10; r += 1) {
      const playing = new Set<string>();
      for (const m of byRound.get(r) ?? []) {
        playing.add(m.pair1Id);
        playing.add(m.pair2Id);
      }
      restsByRound[r] = pairIds.filter((id) => !playing.has(id));
    }

    const restCount = new Map<string, number>();
    for (const id of pairIds) restCount.set(id, 0);
    for (let r = 1; r <= 10; r += 1) {
      for (const id of restsByRound[r] ?? []) {
        restCount.set(id, (restCount.get(id) ?? 0) + 1);
      }
    }
    for (const id of pairIds) {
      if ((restCount.get(id) ?? 0) !== 3) {
        errors.push(
          `La pareja ${id} descansa ${restCount.get(id) ?? 0} rondas; debe descansar exactamente 3.`
        );
      }
    }

    for (let r = 1; r <= 9; r += 1) {
      const a = new Set(restsByRound[r] ?? []);
      const b = restsByRound[r + 1] ?? [];
      for (const id of b) {
        if (a.has(id)) {
          errors.push(
            `La pareja ${id} descansa en rondas consecutivas ${r} y ${r + 1}.`
          );
        }
      }
    }

    const r9Rest = new Set(restsByRound[9] ?? []);
    const r10 = byRound.get(10) ?? [];
    if (r10.length === 1) {
      const m = r10[0];
      if (!r9Rest.has(m.pair1Id) || !r9Rest.has(m.pair2Id)) {
        errors.push(
          "R10 debe enfrentar exactamente a las 2 parejas que descansaron en R9."
        );
      }
    }
    if ((restsByRound[10] ?? []).length !== 6) {
      errors.push(
        `En R10 deben descansar 6 parejas; descansan ${(restsByRound[10] ?? []).length}.`
      );
    }
  }

  return Array.from(new Set(errors));
}
