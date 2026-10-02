import type {
  StandingRowExpress,
  TorneoExpressClasificacionModo,
  TorneoExpressGrupo,
  TorneoExpressGrupoPareja,
  TorneoExpressPartido,
} from "./types";
import { DEFAULT_CLASIFICACION_MODO } from "./types";
import {
  calcularEstadisticas,
  getHeadToHead,
  type MatchResult,
  type PairStanding,
} from "../../utils/standings";
import { computeStandingDif } from "../../utils/standingsDisplay";
import { partidoToMatchResult } from "./partidoSets";

type ExpressPairStanding = PairStanding & {
  setsFavor: number;
  setsContra: number;
};

function standingToExpressRow(
  s: PairStanding & { setsFavor?: number; setsContra?: number },
  grupo: TorneoExpressGrupo,
  label: string
): StandingRowExpress {
  return {
    parejaId: s.pairId,
    parejaLabel: label,
    grupoId: grupo.id,
    grupoNombre: grupo.nombre,
    grupoOrden: grupo.orden,
    pj: s.PJ,
    pg: s.PG,
    pp: s.PP,
    ptsFav: s.juegosFavor,
    ptsCon: s.juegosContra,
    dif: computeStandingDif(s.juegosFavor, s.juegosContra),
    puntos: s.puntos,
    setsFav: s.setsFavor ?? 0,
    setsCon: s.setsContra ?? 0,
  };
}

/** Standings: games desde sets_resultado (o puntos_* legacy). */
function partidosToMatches(partidos: TorneoExpressPartido[]): MatchResult[] {
  const matches: MatchResult[] = [];
  for (const p of partidos) {
    const m = partidoToMatchResult(p);
    if (m) matches.push(m);
  }
  return matches;
}

function enrichWithSetStats(
  stats: PairStanding[],
  matches: MatchResult[]
): ExpressPairStanding[] {
  const setsByPair = new Map<string, { favor: number; contra: number }>();
  for (const s of stats) {
    setsByPair.set(s.pairId, { favor: 0, contra: 0 });
  }
  for (const m of matches) {
    const a = setsByPair.get(m.pairAId);
    const b = setsByPair.get(m.pairBId);
    const setsA = m.setsA ?? 0;
    const setsB = m.setsB ?? 0;
    if (a) {
      a.favor += setsA;
      a.contra += setsB;
    }
    if (b) {
      b.favor += setsB;
      b.contra += setsA;
    }
  }
  return stats.map((s) => {
    const sets = setsByPair.get(s.pairId) ?? { favor: 0, contra: 0 };
    return {
      ...s,
      setsFavor: sets.favor,
      setsContra: sets.contra,
    };
  });
}

/** Torneo Express default: FAV → DIF → PG → H2H → seed. */
function createDifPuntosComparator(matches: MatchResult[]) {
  return (a: ExpressPairStanding, b: ExpressPairStanding): number => {
    if (b.juegosFavor !== a.juegosFavor) return b.juegosFavor - a.juegosFavor;
    if (b.diferencia !== a.diferencia) return b.diferencia - a.diferencia;
    if (b.PG !== a.PG) return b.PG - a.PG;
    const h2h = getHeadToHead(a.pairId, b.pairId, matches);
    if (h2h !== 0) return h2h;
    return a.seed - b.seed;
  };
}

function setDiff(s: ExpressPairStanding): number {
  return s.setsFavor - s.setsContra;
}

/**
 * Desempate Setto dentro de un grupo ya empatado en PG:
 * H2H solo si exactamente 2; luego DIF sets → DIF games → sets → games → seed.
 */
function compareSettoWithinPgTie(
  a: ExpressPairStanding,
  b: ExpressPairStanding,
  matches: MatchResult[],
  tiedCount: number
): number {
  if (tiedCount === 2) {
    const h2h = getHeadToHead(a.pairId, b.pairId, matches);
    if (h2h !== 0) return h2h;
  }
  const setDifA = setDiff(a);
  const setDifB = setDiff(b);
  if (setDifB !== setDifA) return setDifB - setDifA;
  if (b.diferencia !== a.diferencia) return b.diferencia - a.diferencia;
  if (b.setsFavor !== a.setsFavor) return b.setsFavor - a.setsFavor;
  if (b.juegosFavor !== a.juegosFavor) return b.juegosFavor - a.juegosFavor;
  return a.seed - b.seed;
}

/** PG → (H2H si 2 empatados) → DIF sets → DIF games → sets → games → seed. */
function sortSettoPg(
  rows: ExpressPairStanding[],
  matches: MatchResult[]
): ExpressPairStanding[] {
  const byPg = [...rows].sort((a, b) => {
    if (b.PG !== a.PG) return b.PG - a.PG;
    return a.seed - b.seed;
  });

  const result: ExpressPairStanding[] = [];
  let i = 0;
  while (i < byPg.length) {
    let j = i + 1;
    while (j < byPg.length && byPg[j].PG === byPg[i].PG) j += 1;
    const group = byPg.slice(i, j);
    if (group.length === 1) {
      result.push(group[0]);
    } else {
      group.sort((a, b) =>
        compareSettoWithinPgTie(a, b, matches, group.length)
      );
      result.push(...group);
    }
    i = j;
  }
  return result;
}

function calculateExpressStandings(
  pairs: Array<{ id: string; name: string; seed?: number }>,
  matches: MatchResult[],
  modo: TorneoExpressClasificacionModo = DEFAULT_CLASIFICACION_MODO
): PairStanding[] {
  const stats = enrichWithSetStats(calcularEstadisticas(pairs, matches), matches);
  const sorted =
    modo === "setto_pg"
      ? sortSettoPg(stats, matches)
      : [...stats].sort(createDifPuntosComparator(matches));
  return sorted.map((pair, index) => ({ ...pair, posicion: index + 1 }));
}

export function buildStandingsForGrupo(
  grupo: TorneoExpressGrupo,
  parejas: TorneoExpressGrupoPareja[],
  partidos: TorneoExpressPartido[],
  modo: TorneoExpressClasificacionModo = DEFAULT_CLASIFICACION_MODO
): StandingRowExpress[] {
  const labels = new Map<string, string>();
  parejas.forEach((p) => {
    labels.set(p.pareja_id, p.pareja_display || p.pareja_id);
  });

  const pairInputs = parejas.map((p, i) => ({
    id: p.pareja_id,
    name: labels.get(p.pareja_id) ?? p.pareja_id,
    seed: i,
  }));

  const matches = partidosToMatches(partidos);
  const standings = calculateExpressStandings(pairInputs, matches, modo);

  return standings.map((s) =>
    standingToExpressRow(s, grupo, labels.get(s.pairId) ?? s.pairName)
  );
}

export function buildStandingsGeneral(
  grupos: TorneoExpressGrupo[],
  parejasPorGrupo: Record<string, TorneoExpressGrupoPareja[]>,
  partidosPorGrupo: Record<string, TorneoExpressPartido[]>,
  modo: TorneoExpressClasificacionModo = DEFAULT_CLASIFICACION_MODO
): StandingRowExpress[] {
  const pairInputs: Array<{ id: string; name: string; seed?: number }> = [];
  const labels = new Map<string, string>();
  const metaByPair = new Map<
    string,
    { grupo: TorneoExpressGrupo; label: string }
  >();
  const allMatches: MatchResult[] = [];
  let seed = 0;

  grupos.forEach((grupo) => {
    const parejas = parejasPorGrupo[grupo.id] ?? [];
    const partidos = partidosPorGrupo[grupo.id] ?? [];
    allMatches.push(...partidosToMatches(partidos));
    parejas.forEach((p) => {
      const label = p.pareja_display || p.pareja_id;
      labels.set(p.pareja_id, label);
      metaByPair.set(p.pareja_id, { grupo, label });
      pairInputs.push({ id: p.pareja_id, name: label, seed: seed++ });
    });
  });

  const standings = calculateExpressStandings(pairInputs, allMatches, modo);

  return standings.map((s) => {
    const meta = metaByPair.get(s.pairId);
    const grupo = meta?.grupo ?? grupos[0];
    return standingToExpressRow(
      s,
      grupo,
      meta?.label ?? labels.get(s.pairId) ?? s.pairName
    );
  });
}

export function formatPairDisplay(
  player1Name?: string,
  player2Name?: string
): string {
  const a = (player1Name ?? "").trim();
  const b = (player2Name ?? "").trim();
  if (a && b) return `${a} / ${b}`;
  return a || b || "Pareja";
}

export function pairLabel(
  parejaId: string,
  meta: Map<string, { parejaLabel: string }>
): string {
  return meta.get(parejaId)?.parejaLabel ?? parejaId.slice(0, 8);
}
