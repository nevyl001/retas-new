/**
 * Empaqueta partidos de una jornada en rondas sin doble-booking de equipo,
 * respetando el tope de canchas (afecta horarios, no la cantidad de partidos).
 *
 * Cuando una Jornada agrupa 2 rondas Berger, empaquetar por bloque: primero
 * toda la ronda Berger A (en sub-bloques de canchas), después la B.
 */

export type SchedulableMatch<T> = T & {
  equipo1_id: string;
  equipo2_id: string;
};

export type ScheduledMatch<T> = SchedulableMatch<T> & {
  ronda: number;
  cancha: number;
};

/** Empaqueta un conjunto de partidos mutuamente (idealmente) disjuntos en canchas. */
export function packPlayoffsJornadaMatches<T>(
  matches: SchedulableMatch<T>[],
  canchas: number
): ScheduledMatch<T>[] {
  const courts = Math.max(1, Math.floor(canchas) || 1);
  const pending = [...matches];
  const scheduled: ScheduledMatch<T>[] = [];
  let ronda = 1;
  let courtCursor = 0;

  while (pending.length > 0) {
    const busy = new Set<string>();
    const usedThisRound: SchedulableMatch<T>[] = [];
    let courtsLeft = courts;

    for (let i = 0; i < pending.length && courtsLeft > 0; i++) {
      const m = pending[i]!;
      if (busy.has(m.equipo1_id) || busy.has(m.equipo2_id)) continue;
      usedThisRound.push(m);
      busy.add(m.equipo1_id);
      busy.add(m.equipo2_id);
      courtsLeft -= 1;
    }

    if (usedThisRound.length === 0) {
      // No debería ocurrir con fixtures válidos; fuerza avance
      const m = pending[0]!;
      scheduled.push({
        ...m,
        ronda,
        cancha: (courtCursor % courts) + 1,
      });
      courtCursor += 1;
      pending.shift();
      ronda += 1;
      continue;
    }

    for (const m of usedThisRound) {
      scheduled.push({
        ...m,
        ronda,
        cancha: (courtCursor % courts) + 1,
      });
      courtCursor += 1;
      const idx = pending.indexOf(m);
      if (idx >= 0) pending.splice(idx, 1);
    }
    ronda += 1;
  }

  return scheduled;
}

/**
 * Empaqueta bloques Berger en orden: el bloque 2 no empieza hasta terminar el 1.
 * Las canchas solo subdividen cada bloque; nunca mezclan rondas Berger.
 */
export function packPlayoffsJornadaBergerBlocks<T>(
  bergerBlocks: SchedulableMatch<T>[][],
  canchas: number
): ScheduledMatch<T>[] {
  const out: ScheduledMatch<T>[] = [];
  let rondaOffset = 0;
  for (const block of bergerBlocks) {
    if (!block.length) continue;
    const packed = packPlayoffsJornadaMatches(block, canchas);
    for (const m of packed) {
      out.push({ ...m, ronda: m.ronda + rondaOffset });
    }
    const maxRonda = packed.reduce((acc, m) => Math.max(acc, m.ronda), 0);
    rondaOffset += maxRonda;
  }
  return out;
}

/** Ninguna pareja en dos partidos de la misma ronda horaria. */
export function assertNoTeamDoubleBookedInRound<T>(
  packed: ScheduledMatch<T>[]
): void {
  const byRonda = new Map<number, string[]>();
  for (const m of packed) {
    const list = byRonda.get(m.ronda) ?? [];
    list.push(m.equipo1_id, m.equipo2_id);
    byRonda.set(m.ronda, list);
  }
  for (const [ronda, ids] of Array.from(byRonda.entries())) {
    if (new Set(ids).size !== ids.length) {
      throw new Error(`Doble-booking en ronda ${ronda}`);
    }
  }
}
