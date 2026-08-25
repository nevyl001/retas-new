/**
 * Bracket playoffs N-variable: top4 SF+Final; 5..N cruces extremos + BYE opcional.
 */

import { compareEquiposRanking, type EquipoRankingSortRow } from "./equiposRanking";

export type PlayoffBracketSlot = string; // SF1 | SF2 | CL1..CLk | FINAL
export type PlayoffFase =
  | "regular"
  | "semifinal"
  | "classification"
  | "final";

export const PLAYOFFS_SEEDS_BYE_KEY = "classification_bye";

/** Seeds 1..N (+ opcional classification_bye = equipo_id). */
export type PlayoffSeeds = Record<string, string>;

export type PlayoffCross = {
  slot: PlayoffBracketSlot;
  fase: PlayoffFase;
  equipo1_id: string;
  equipo2_id: string;
  seedHome: number;
  seedAway: number;
};

export type ClassificationPlan = {
  crosses: PlayoffCross[];
  /** Seed number that gets BYE (odd block), else null. */
  byeSeed: number | null;
  byeEquipoId: string | null;
};

export function seedCount(seeds: PlayoffSeeds): number {
  let n = 0;
  for (let i = 1; ; i++) {
    if (typeof seeds[String(i)] !== "string" || !seeds[String(i)]) break;
    n = i;
  }
  return n;
}

export function seedsFromRankingOrder(equipoIdsRanked: string[]): PlayoffSeeds {
  if (equipoIdsRanked.length < 4) {
    throw new Error("Se requieren al menos 4 posiciones para seeds.");
  }
  const out: PlayoffSeeds = {};
  equipoIdsRanked.forEach((id, idx) => {
    out[String(idx + 1)] = id;
  });
  const plan = buildClassificationPlan(out);
  if (plan.byeEquipoId) {
    out[PLAYOFFS_SEEDS_BYE_KEY] = plan.byeEquipoId;
  }
  return out;
}

export function parsePlayoffSeeds(raw: unknown): PlayoffSeeds | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const out: PlayoffSeeds = {};
  let n = 0;
  for (let i = 1; ; i++) {
    const v = o[String(i)];
    if (typeof v !== "string" || !v) break;
    out[String(i)] = v;
    n = i;
  }
  if (n < 4) return null;
  for (let i = 1; i <= n; i++) {
    if (!out[String(i)]) return null;
  }
  // Rechazar claves numéricas fuera de 1..N (huecos / huérfanas).
  for (const key of Object.keys(o)) {
    if (!/^\d+$/.test(key)) continue;
    const num = Number(key);
    if (num < 1 || num > n) return null;
  }
  const ids = Array.from({ length: n }, (_, i) => out[String(i + 1)]!);
  if (new Set(ids).size !== n) return null;

  if (typeof o[PLAYOFFS_SEEDS_BYE_KEY] === "string" && o[PLAYOFFS_SEEDS_BYE_KEY]) {
    const byeId = String(o[PLAYOFFS_SEEDS_BYE_KEY]);
    if (!ids.includes(byeId)) return null;
    out[PLAYOFFS_SEEDS_BYE_KEY] = byeId;
  }
  return out;
}

export function buildClassificationPlan(seeds: PlayoffSeeds): ClassificationPlan {
  const n = seedCount(seeds);
  if (n < 4) {
    throw new Error("Seeds insuficientes para playoffs.");
  }
  const crosses: PlayoffCross[] = [];
  let low = 5;
  let high = n;
  let cl = 1;
  while (low < high) {
    const e1 = seeds[String(low)];
    const e2 = seeds[String(high)];
    if (!e1 || !e2) {
      throw new Error(`Seed faltante para CL (${low} vs ${high})`);
    }
    crosses.push({
      slot: `CL${cl}`,
      fase: "classification",
      equipo1_id: e1,
      equipo2_id: e2,
      seedHome: low,
      seedAway: high,
    });
    cl += 1;
    low += 1;
    high -= 1;
  }

  let byeSeed: number | null = null;
  let byeEquipoId: string | null = null;
  if (low === high) {
    byeSeed = low;
    byeEquipoId = seeds[String(low)] ?? null;
  }

  return { crosses, byeSeed, byeEquipoId };
}

/** SF + CL a partir de seeds congelados (única fuente). */
export function buildPlayoffCrosses(seeds: PlayoffSeeds): {
  crosses: PlayoffCross[];
  byeSeed: number | null;
  byeEquipoId: string | null;
} {
  const n = seedCount(seeds);
  if (n < 4) throw new Error("Se requieren al menos 4 seeds.");

  const sf: PlayoffCross[] = [
    {
      slot: "SF1",
      fase: "semifinal",
      equipo1_id: seeds["1"]!,
      equipo2_id: seeds["4"]!,
      seedHome: 1,
      seedAway: 4,
    },
    {
      slot: "SF2",
      fase: "semifinal",
      equipo1_id: seeds["2"]!,
      equipo2_id: seeds["3"]!,
      seedHome: 2,
      seedAway: 3,
    },
  ];
  const plan = buildClassificationPlan(seeds);
  return {
    crosses: [...sf, ...plan.crosses],
    byeSeed: plan.byeSeed,
    byeEquipoId: plan.byeEquipoId,
  };
}

/** @deprecated usar buildPlayoffCrosses */
export function buildJornada9Crosses(seeds: PlayoffSeeds): PlayoffCross[] {
  return buildPlayoffCrosses(seeds).crosses;
}

export function buildGranFinalCross(
  winnerSf1: string,
  winnerSf2: string
): PlayoffCross {
  return {
    slot: "FINAL",
    fase: "final",
    equipo1_id: winnerSf1,
    equipo2_id: winnerSf2,
    seedHome: 0,
    seedAway: 0,
  };
}

export type PlayoffMatchResult = {
  slot: PlayoffBracketSlot;
  equipo1_id: string;
  equipo2_id: string;
  winner_id: string;
  loser_id: string;
};

export type EquipoStandingRow = EquipoRankingSortRow & {
  equipo_id: string;
};

function seedOf(seeds: PlayoffSeeds, equipoId: string): number {
  const n = seedCount(seeds);
  for (let i = 1; i <= n; i++) {
    if (seeds[String(i)] === equipoId) return i;
  }
  return 999;
}

function compareWithSeedFallback(
  a: EquipoStandingRow,
  b: EquipoStandingRow,
  seeds: PlayoffSeeds
): number {
  const cmp = compareEquiposRanking(a, b);
  if (cmp !== 0) return cmp;
  return seedOf(seeds, a.equipo_id) - seedOf(seeds, b.equipo_id);
}

function sortBlock(
  ids: string[],
  byId: Map<string, EquipoStandingRow>,
  seeds: PlayoffSeeds
): string[] {
  return [...ids].sort((a, b) => {
    const ra = byId.get(a);
    const rb = byId.get(b);
    if (!ra || !rb) return seedOf(seeds, a) - seedOf(seeds, b);
    return compareWithSeedFallback(ra, rb, seeds);
  });
}

/**
 * Clasificación final 1..N.
 * 1–2 FINAL; 3–4 perdedores SF; 5..N ganadores CL / BYE / perdedores CL.
 */
export function resolvePlayoffsFinalStandings(input: {
  seeds: PlayoffSeeds;
  results: PlayoffMatchResult[];
  standings: EquipoStandingRow[];
}): string[] {
  const n = seedCount(input.seeds);
  const bySlot = new Map(input.results.map((r) => [r.slot, r]));
  const final = bySlot.get("FINAL");
  const sf1 = bySlot.get("SF1");
  const sf2 = bySlot.get("SF2");
  if (!final || !sf1 || !sf2) {
    throw new Error("Faltan FINAL/SF para la clasificación final.");
  }

  const clResults = input.results.filter((r) => r.slot.startsWith("CL"));
  const expectedCl = Math.floor((n - 4) / 2);
  if (clResults.length < expectedCl) {
    throw new Error(
      `Faltan partidos CL (esperados ${expectedCl}, hay ${clResults.length}).`
    );
  }

  const byId = new Map(input.standings.map((s) => [s.equipo_id, s]));
  const thirds = sortBlock([sf1.loser_id, sf2.loser_id], byId, input.seeds);

  const winners = clResults.map((r) => r.winner_id);
  const losers = clResults.map((r) => r.loser_id);
  const winnersSorted = sortBlock(winners, byId, input.seeds);
  const losersSorted = sortBlock(losers, byId, input.seeds);

  const byeId =
    input.seeds[PLAYOFFS_SEEDS_BYE_KEY] ??
    buildClassificationPlan(input.seeds).byeEquipoId;

  const lower: string[] = [...winnersSorted];
  if (byeId) lower.push(byeId);
  lower.push(...losersSorted);

  if (lower.length !== n - 4) {
    throw new Error(
      `Bloque 5..N inconsistente: ${lower.length} vs ${n - 4}`
    );
  }

  return [final.winner_id, final.loser_id, thirds[0]!, thirds[1]!, ...lower];
}

export function mergeBracketSlots<T extends { slot: PlayoffBracketSlot }>(
  existing: T[],
  incoming: T[]
): T[] {
  const map = new Map<PlayoffBracketSlot, T>();
  for (const e of existing) map.set(e.slot, e);
  for (const i of incoming) {
    if (!map.has(i.slot)) map.set(i.slot, i);
  }
  return Array.from(map.values());
}

export function playoffsJornadaNumero(
  totalRegularJornadas: number,
  kind: "playoffs" | "final"
): number {
  return kind === "playoffs"
    ? totalRegularJornadas + 1
    : totalRegularJornadas + 2;
}
