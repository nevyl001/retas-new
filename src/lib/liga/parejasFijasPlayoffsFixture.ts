/**
 * Fixture regular parejas_fijas_playoffs para N≥4.
 * Berger/circle → agrupa 2 rondas Berger = 1 Jornada de Liga · 2 vueltas.
 */

import {
  buildBergerRounds,
  LIGA_EQUIPO_BYE,
} from "./fixedPairSchedule";

export const PLAYOFFS_MIN_TEAMS = 4;

export const PLAYOFFS_MIN_TEAMS_MSG =
  "Este formato requiere al menos 4 parejas.";

export function expectedRegularMatchCount(n: number): number {
  return n * (n - 1);
}

export function expectedMatchesPerTeam(n: number): number {
  return 2 * (n - 1);
}

/** Rondas Berger por vuelta (par: N-1; impar con BYE: N). */
export function bergerRoundsPerVuelta(n: number): number {
  return n % 2 === 0 ? n - 1 : n;
}

/** Jornadas de app por vuelta (= ceil(rondasBerger / 2)). */
export function jornadasPerVuelta(n: number): number {
  return Math.ceil(bergerRoundsPerVuelta(n) / 2);
}

export function totalRegularJornadas(n: number): number {
  return jornadasPerVuelta(n) * 2;
}

export type PlayoffsFixtureMatch = {
  equipo1_id: string;
  equipo2_id: string;
};

export type PlayoffsFixtureJornada = {
  numero: number;
  vuelta: 1 | 2;
  /** Flatten de bergerBlocks (compat / conteos). */
  matches: PlayoffsFixtureMatch[];
  /**
   * Rondas Berger agrupadas en esta jornada (1 o 2).
   * El empaquetado debe respetar el orden de estos bloques.
   */
  bergerBlocks: PlayoffsFixtureMatch[][];
};

export type PlayoffsRegularFixture = {
  jornadas: PlayoffsFixtureJornada[];
  matchCount: number;
  teamCount: number;
};

function groupBergerRoundsIntoJornadas(
  bergerRounds: Array<{ matches: Array<{ equipo1_id: string; equipo2_id: string }> }>,
  vuelta: 1 | 2,
  startNumero: number,
  invert: boolean
): PlayoffsFixtureJornada[] {
  const out: PlayoffsFixtureJornada[] = [];
  let numero = startNumero;
  for (let i = 0; i < bergerRounds.length; i += 2) {
    const chunk = bergerRounds.slice(i, i + 2);
    const bergerBlocks: PlayoffsFixtureMatch[][] = [];
    for (const round of chunk) {
      const block: PlayoffsFixtureMatch[] = [];
      for (const m of round.matches) {
        if (
          m.equipo1_id === LIGA_EQUIPO_BYE ||
          m.equipo2_id === LIGA_EQUIPO_BYE
        ) {
          continue;
        }
        block.push(
          invert
            ? { equipo1_id: m.equipo2_id, equipo2_id: m.equipo1_id }
            : { equipo1_id: m.equipo1_id, equipo2_id: m.equipo2_id }
        );
      }
      if (block.length) bergerBlocks.push(block);
    }
    const matches = bergerBlocks.flat();
    out.push({ numero, vuelta, matches, bergerBlocks });
    numero += 1;
  }
  return out;
}

/**
 * Ida + vuelta: agrupa cada 2 rondas Berger en una Jornada.
 * Sin partidos BYE. Orden de `equipoIds` = slots estables P1…PN.
 */
export function buildPlayoffsRegularFixture(
  equipoIds: string[]
): PlayoffsRegularFixture {
  const n = equipoIds.length;
  if (n < PLAYOFFS_MIN_TEAMS) {
    throw new Error(PLAYOFFS_MIN_TEAMS_MSG);
  }
  const unique = new Set(equipoIds);
  if (unique.size !== n) {
    throw new Error("Las parejas deben ser distintas.");
  }

  const berger = buildBergerRounds(equipoIds);
  if (!berger.length) {
    throw new Error("No se pudo generar el calendario Berger.");
  }

  const vuelta1 = groupBergerRoundsIntoJornadas(berger, 1, 1, false);
  const vuelta2 = groupBergerRoundsIntoJornadas(
    berger,
    2,
    vuelta1.length + 1,
    true
  );
  const jornadas = [...vuelta1, ...vuelta2];
  const matchCount = jornadas.reduce((acc, j) => acc + j.matches.length, 0);

  return { jornadas, matchCount, teamCount: n };
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function assertPlayoffsFixtureInvariants(
  fixture: PlayoffsRegularFixture,
  equipoIds: string[]
): void {
  const n = equipoIds.length;
  const expectedTotal = expectedRegularMatchCount(n);
  const expectedPerTeam = expectedMatchesPerTeam(n);

  if (fixture.matchCount !== expectedTotal) {
    throw new Error(
      `Expected ${expectedTotal} matches, got ${fixture.matchCount}`
    );
  }
  if (fixture.jornadas.length !== totalRegularJornadas(n)) {
    throw new Error(
      `Expected ${totalRegularJornadas(n)} jornadas, got ${fixture.jornadas.length}`
    );
  }

  const byTeam = new Map<string, number>();
  const pairCounts = new Map<string, number>();
  for (const id of equipoIds) byTeam.set(id, 0);

  for (const j of fixture.jornadas) {
    for (const m of j.matches) {
      if (m.equipo1_id === LIGA_EQUIPO_BYE || m.equipo2_id === LIGA_EQUIPO_BYE) {
        throw new Error("BYE must not appear as a match");
      }
      byTeam.set(m.equipo1_id, (byTeam.get(m.equipo1_id) ?? 0) + 1);
      byTeam.set(m.equipo2_id, (byTeam.get(m.equipo2_id) ?? 0) + 1);
      const k = pairKey(m.equipo1_id, m.equipo2_id);
      pairCounts.set(k, (pairCounts.get(k) ?? 0) + 1);
    }
  }

  for (const id of equipoIds) {
    if (byTeam.get(id) !== expectedPerTeam) {
      throw new Error(
        `Team ${id}: expected ${expectedPerTeam}, got ${byTeam.get(id)}`
      );
    }
  }

  const expectedPairs = (n * (n - 1)) / 2;
  if (pairCounts.size !== expectedPairs) {
    throw new Error(
      `Expected ${expectedPairs} unique pairs, got ${pairCounts.size}`
    );
  }
  for (const [, c] of Array.from(pairCounts.entries())) {
    if (c !== 2) throw new Error(`Pair meeting count ${c} !== 2`);
  }

  // Cada vuelta: cada pareja enfrenta N-1 rivales distintos una vez
  for (const vuelta of [1, 2] as const) {
    const jornadasV = fixture.jornadas.filter((j) => j.vuelta === vuelta);
    for (const id of equipoIds) {
      const rivals = new Set<string>();
      for (const j of jornadasV) {
        for (const m of j.matches) {
          if (m.equipo1_id === id) rivals.add(m.equipo2_id);
          if (m.equipo2_id === id) rivals.add(m.equipo1_id);
        }
      }
      if (rivals.size !== n - 1) {
        throw new Error(
          `Vuelta ${vuelta}: ${id} enfrentó ${rivals.size} rivales (esperado ${n - 1})`
        );
      }
    }
  }
}

/** Infiere N tal que N*(N-1) = totalPartidosRegulares. */
export function inferTeamCountFromRegularMatchTotal(
  totalRegularMatches: number
): number | null {
  if (totalRegularMatches < expectedRegularMatchCount(PLAYOFFS_MIN_TEAMS)) {
    return null;
  }
  const disc = 1 + 4 * totalRegularMatches;
  const root = Math.round(Math.sqrt(disc));
  if (root * root !== disc) return null;
  const n = (1 + root) / 2;
  if (!Number.isInteger(n) || n < PLAYOFFS_MIN_TEAMS) return null;
  return n;
}

/** @deprecated usar PLAYOFFS_MIN_TEAMS */
export const PLAYOFFS_REQUIRED_TEAMS = PLAYOFFS_MIN_TEAMS;
/** @deprecated usar expectedRegularMatchCount(n) */
export const PLAYOFFS_REGULAR_MATCHES = 56;
export const PLAYOFFS_EXACT_TEAMS_MSG = PLAYOFFS_MIN_TEAMS_MSG;
