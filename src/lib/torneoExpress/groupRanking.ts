/**
 * Clasificación de un grupo, derivada de partidos ya jugados.
 *
 * Terminación: un bloque se resuelve una sola vez.
 * - 1 pareja: queda en su sitio.
 * - 2 parejas en dif_puntos: un enfrentamiento directo, o empate sin resolver.
 * - 3 o más en dif_puntos: un mini-ranking FAV → DIF → PG. Lo que siga igual
 *   no vuelve a entrar al mismo procedimiento.
 * - setto_pg ordena por puntos (2 por partido ganado), diferencia de
 *   games y sets (diferencia, luego sets ganados). El cara a cara solo
 *   separa a dos que sigan iguales. Lo que siga empatado queda sin resolver.
 *
 * El orden del arreglo dentro de un empate sin resolver es solo de presentación.
 * La posición deportiva es `posicion`, compartida por todo el subconjunto.
 */
import type { TorneoExpressClasificacionModo } from "./types";
import type { StandingTie } from "./types";
import {
  calcularEstadisticas,
  getHeadToHead,
  type MatchResult,
} from "../../utils/standings";
import { canonicalMatchupKey } from "./roundRobin";

export type { StandingTie };

export type GroupStandingStats = {
  pairId: string;
  pairName: string;
  pj: number;
  pg: number;
  pp: number;
  pe: number;
  juegosFavor: number;
  juegosContra: number;
  diferencia: number;
  puntos: number;
  setsFavor: number;
  setsContra: number;
};

export type RankedGroupStanding = GroupStandingStats & {
  posicion: number;
  tie: StandingTie;
};

export type MiniRankRow = {
  pairId: string;
  fav: number;
  dif: number;
  pg: number;
  posicion: number;
  tie: StandingTie;
};

const RESOLVED: StandingTie = { status: "resolved" };

function unresolvedTie(pairIds: readonly string[]): StandingTie {
  return {
    status: "unresolved",
    pairIds: [...pairIds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
  };
}

function sortByKeys<T>(items: readonly T[], keyOf: (item: T) => readonly number[]): T[] {
  return items
    .map((item, index) => ({ item, index, key: keyOf(item) }))
    .sort((a, b) => {
      const len = Math.max(a.key.length, b.key.length);
      for (let i = 0; i < len; i += 1) {
        const av = a.key[i] ?? 0;
        const bv = b.key[i] ?? 0;
        if (av !== bv) return bv - av;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

function sliceEqualRuns<T>(
  sorted: readonly T[],
  keyOf: (item: T) => readonly number[]
): T[][] {
  const runs: T[][] = [];
  sorted.forEach((item) => {
    const key = keyOf(item);
    const current = runs[runs.length - 1];
    const previous = current?.[0];
    if (!current || !previous || !sameKey(keyOf(previous), key)) {
      runs.push([item]);
      return;
    }
    current.push(item);
  });
  return runs;
}

function sameKey(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function difPrimaryKey(row: GroupStandingStats): readonly number[] {
  return [row.juegosFavor, row.diferencia, row.pg];
}

/** 2 puntos por partido ganado, games, y luego sets ganados contra perdidos. */
function settoRankKey(row: GroupStandingStats): readonly number[] {
  return [
    row.puntos,
    row.diferencia,
    row.setsFavor - row.setsContra,
    row.setsFavor,
  ];
}

function matchesInside(pairIds: ReadonlySet<string>, matches: readonly MatchResult[]): MatchResult[] {
  return matches.filter(
    (match) =>
      match.pairAId !== match.pairBId &&
      pairIds.has(match.pairAId) &&
      pairIds.has(match.pairBId)
  );
}

function directMatches(
  idA: string,
  idB: string,
  matches: readonly MatchResult[]
): MatchResult[] {
  const key = canonicalMatchupKey(idA, idB);
  return matches.filter(
    (match) => canonicalMatchupKey(match.pairAId, match.pairBId) === key
  );
}

export type TwoWayTieResult =
  | { status: "resolved"; winnerId: string; loserId: string }
  | { status: "unresolved" };

/**
 * Ganador del único enfrentamiento entre dos parejas.
 * Más de un partido, empate o marcador contradictorio quedan sin resolver.
 */
export function resolveTwoWayTie(
  idA: string,
  idB: string,
  matches: readonly MatchResult[]
): TwoWayTieResult {
  const found = directMatches(idA, idB, matches);
  if (found.length !== 1) return { status: "unresolved" };

  const match = found[0];
  const gamesForA = match.pairAId === idA ? match.gamesA : match.gamesB;
  const gamesForB = match.pairAId === idA ? match.gamesB : match.gamesA;
  const gamesWinner =
    gamesForA > gamesForB ? idA : gamesForB > gamesForA ? idB : null;
  const named = match.winnerId === idA || match.winnerId === idB ? match.winnerId : null;

  if (match.winnerId != null && match.winnerId !== "" && named == null) {
    return { status: "unresolved" };
  }
  if (named && gamesWinner && named !== gamesWinner) {
    return { status: "unresolved" };
  }

  const winnerId = named ?? gamesWinner;
  if (!winnerId) return { status: "unresolved" };
  const loserId = winnerId === idA ? idB : idA;
  return { status: "resolved", winnerId, loserId };
}

function miniStats(
  pairIds: readonly string[],
  matches: readonly MatchResult[]
): Map<string, { fav: number; dif: number; pg: number }> {
  const rows = calcularEstadisticas(
    pairIds.map((id) => ({ id, name: id })),
    [...matches]
  );
  return new Map(
    rows.map((row) => [
      row.pairId,
      { fav: row.juegosFavor, dif: row.diferencia, pg: row.PG },
    ])
  );
}

/**
 * Mini-ranking de un bloque. Solo usa partidos cuyos dos lados están en el bloque.
 * Una pasada: FAV → DIF → PG. No llama a H2H ni se vuelve a invocar.
 */
export function calculateMiniRanking(
  pairIds: readonly string[],
  matches: readonly MatchResult[]
): MiniRankRow[] {
  const ids = [...pairIds];
  const internal = matchesInside(new Set(ids), matches);
  const stats = miniStats(ids, internal);
  const rows = ids.map((pairId) => {
    const stat = stats.get(pairId) ?? { fav: 0, dif: 0, pg: 0 };
    return { pairId, ...stat };
  });
  const sorted = sortByKeys(rows, (row) => [row.fav, row.dif, row.pg]);
  const runs = sliceEqualRuns(sorted, (row) => [row.fav, row.dif, row.pg]);

  const ranked: MiniRankRow[] = [];
  let posicion = 1;
  runs.forEach((run) => {
    const tie = run.length === 1 ? RESOLVED : unresolvedTie(run.map((row) => row.pairId));
    run.forEach((row) => {
      ranked.push({ ...row, posicion, tie });
    });
    posicion += run.length;
  });
  return ranked;
}

type RankBlock = {
  rows: GroupStandingStats[];
  tie: StandingTie;
};

function blockOf(rows: GroupStandingStats[], tie: StandingTie): RankBlock {
  return { rows, tie };
}

function resolveDifBlock(
  block: readonly GroupStandingStats[],
  matches: readonly MatchResult[]
): RankBlock[] {
  if (block.length <= 1) {
    return [blockOf([...block], RESOLVED)];
  }
  if (block.length === 2) {
    const [first, second] = block;
    const h2h = resolveTwoWayTie(first.pairId, second.pairId, matches);
    if (h2h.status === "unresolved") {
      return [blockOf([first, second], unresolvedTie([first.pairId, second.pairId]))];
    }
    const winner = first.pairId === h2h.winnerId ? first : second;
    const loser = first.pairId === h2h.winnerId ? second : first;
    return [blockOf([winner], RESOLVED), blockOf([loser], RESOLVED)];
  }

  const mini = calculateMiniRanking(
    block.map((row) => row.pairId),
    matches
  );
  const byId = new Map(block.map((row) => [row.pairId, row]));
  const blocks: RankBlock[] = [];
  mini.forEach((row) => {
    const stats = byId.get(row.pairId);
    if (!stats) return;
    const previous = blocks[blocks.length - 1];
    if (row.tie.status === "resolved") {
      blocks.push(blockOf([stats], RESOLVED));
      return;
    }
    if (
      previous &&
      previous.tie.status === "unresolved" &&
      samePairSet(previous.tie.pairIds, row.tie.pairIds)
    ) {
      previous.rows.push(stats);
      return;
    }
    blocks.push(blockOf([stats], row.tie));
  });
  return blocks;
}

function samePairSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((id, index) => id === b[index]);
}

function resolveSettoBlock(
  block: readonly GroupStandingStats[],
  matches: readonly MatchResult[]
): RankBlock[] {
  if (block.length <= 1) {
    return [blockOf([...block], RESOLVED)];
  }

  if (block.length === 2) {
    const [first, second] = block;
    const h2h = getHeadToHead(first.pairId, second.pairId, [...matches]);
    if (h2h < 0) {
      return [blockOf([first], RESOLVED), blockOf([second], RESOLVED)];
    }
    if (h2h > 0) {
      return [blockOf([second], RESOLVED), blockOf([first], RESOLVED)];
    }
  }

  return [blockOf([...block], unresolvedTie(block.map((row) => row.pairId)))];
}

function assignCompetitionRanks(blocks: readonly RankBlock[]): RankedGroupStanding[] {
  const ranked: RankedGroupStanding[] = [];
  let posicion = 1;
  blocks.forEach((block) => {
    block.rows.forEach((row) => {
      ranked.push({ ...row, posicion, tie: block.tie });
    });
    posicion += block.rows.length;
  });
  return ranked;
}

export function rankGroupStandings(
  stats: readonly GroupStandingStats[],
  matches: readonly MatchResult[],
  modo: TorneoExpressClasificacionModo
): RankedGroupStanding[] {
  if (modo === "setto_pg") {
    const sorted = sortByKeys(stats, settoRankKey);
    const blocks = sliceEqualRuns(sorted, settoRankKey).flatMap((run) =>
      resolveSettoBlock(run, matches)
    );
    return assignCompetitionRanks(blocks);
  }

  const sorted = sortByKeys(stats, difPrimaryKey);
  const blocks = sliceEqualRuns(sorted, difPrimaryKey).flatMap((run) =>
    resolveDifBlock(run, matches)
  );
  return assignCompetitionRanks(blocks);
}
