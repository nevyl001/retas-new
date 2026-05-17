/**
 * RivieraApp — Motor de clasificación v2.0
 * 7 criterios de desempate en cascada (mismas reglas en todos los modos).
 */
import {
  computeStandingDif,
  formatStandingDif,
} from "./standingsDisplay";

export interface MatchResult {
  pairAId: string;
  pairBId: string;
  gamesA: number;
  gamesB: number;
}

export interface PairStanding {
  pairId: string;
  pairName: string;
  seed: number;
  PJ: number;
  PG: number;
  PE: number;
  PP: number;
  juegosFavor: number;
  juegosContra: number;
  diferencia: number;
  puntos: number;
  posicion?: number;
}

export const calcularPuntos = (pg: number, pe: number): number => pg * 2 + pe * 1;

export const buildStandings = (
  pairs: Array<{ id: string; name: string; seed?: number }>,
  matches: MatchResult[]
): PairStanding[] => {
  const statsMap: Record<string, PairStanding> = {};

  pairs.forEach((pair, index) => {
    statsMap[pair.id] = {
      pairId: pair.id,
      pairName: pair.name,
      seed: pair.seed ?? index,
      PJ: 0,
      PG: 0,
      PE: 0,
      PP: 0,
      juegosFavor: 0,
      juegosContra: 0,
      diferencia: 0,
      puntos: 0,
    };
  });

  matches.forEach((match) => {
    const a = statsMap[match.pairAId];
    const b = statsMap[match.pairBId];
    if (!a || !b) return;

    a.PJ++;
    b.PJ++;
    a.juegosFavor += match.gamesA;
    a.juegosContra += match.gamesB;
    b.juegosFavor += match.gamesB;
    b.juegosContra += match.gamesA;

    if (match.gamesA > match.gamesB) {
      a.PG++;
      b.PP++;
    } else if (match.gamesB > match.gamesA) {
      b.PG++;
      a.PP++;
    } else {
      a.PE++;
      b.PE++;
    }
  });

  Object.values(statsMap).forEach((stats) => {
    stats.diferencia = stats.juegosFavor - stats.juegosContra;
    stats.puntos = calcularPuntos(stats.PG, stats.PE);
  });

  const result = Object.values(statsMap);
  if (process.env.NODE_ENV === "development") {
    validateStandings(result, matches);
  }
  return result;
};

/** Comprobaciones de integridad (solo desarrollo). */
export function validateStandings(
  standings: PairStanding[],
  _matches: MatchResult[] = []
): void {
  standings.forEach((s) => {
    console.assert(
      s.PJ === s.PG + s.PE + s.PP,
      `[standings] ${s.pairName}: PJ no cuadra`
    );
    console.assert(
      s.puntos === s.PG * 2 + s.PE,
      `[standings] ${s.pairName}: PTS de tabla incorrectos`
    );
    console.assert(
      s.diferencia === s.juegosFavor - s.juegosContra,
      `[standings] ${s.pairName}: DIF no cuadra`
    );
    if (s.PG === 0) {
      console.assert(
        s.puntos === 0,
        `[standings] ${s.pairName}: 0 victorias pero tiene PTS`
      );
    }
  });
  const totalFav = standings.reduce((acc, s) => acc + s.juegosFavor, 0);
  const totalCon = standings.reduce((acc, s) => acc + s.juegosContra, 0);
  console.assert(
    totalFav === totalCon,
    `[standings] Integridad: total FAV (${totalFav}) ≠ total CON (${totalCon})`
  );
};

export const getHeadToHeadWinner = (
  pairAId: string,
  pairBId: string,
  matches: MatchResult[]
): string | null => {
  const h2hMatches = matches.filter(
    (m) =>
      (m.pairAId === pairAId && m.pairBId === pairBId) ||
      (m.pairAId === pairBId && m.pairBId === pairAId)
  );

  if (h2hMatches.length === 0) return null;

  let winsA = 0;
  let winsB = 0;
  let gamesA = 0;
  let gamesB = 0;

  h2hMatches.forEach((m) => {
    if (m.pairAId === pairAId) {
      gamesA += m.gamesA;
      gamesB += m.gamesB;
      if (m.gamesA > m.gamesB) winsA++;
      else if (m.gamesB > m.gamesA) winsB++;
    } else {
      gamesA += m.gamesB;
      gamesB += m.gamesA;
      if (m.gamesB > m.gamesA) winsA++;
      else if (m.gamesA > m.gamesB) winsB++;
    }
  });

  if (winsA > winsB) return pairAId;
  if (winsB > winsA) return pairBId;
  if (gamesA > gamesB) return pairAId;
  if (gamesB > gamesA) return pairBId;
  return null;
};

export const createStandingsComparator = (matches: MatchResult[]) => {
  return (a: PairStanding, b: PairStanding): number => {
    if (b.puntos !== a.puntos) return b.puntos - a.puntos;
    if (b.diferencia !== a.diferencia) return b.diferencia - a.diferencia;
    if (b.juegosFavor !== a.juegosFavor) return b.juegosFavor - a.juegosFavor;
    if (b.PG !== a.PG) return b.PG - a.PG;

    const h2hWinner = getHeadToHeadWinner(a.pairId, b.pairId, matches);
    if (h2hWinner === a.pairId) return -1;
    if (h2hWinner === b.pairId) return 1;

    if (a.juegosContra !== b.juegosContra) return a.juegosContra - b.juegosContra;

    return a.seed - b.seed;
  };
};

export const sortStandings = (
  standings: PairStanding[],
  matches: MatchResult[]
): PairStanding[] => {
  const comparator = createStandingsComparator(matches);
  return [...standings]
    .sort(comparator)
    .map((pair, index) => ({
      ...pair,
      posicion: index + 1,
    }));
};

export const calculateFinalStandings = (
  pairs: Array<{ id: string; name: string; seed?: number }>,
  matches: MatchResult[]
): PairStanding[] => {
  const standings = buildStandings(pairs, matches);
  return sortStandings(standings, matches);
};

export const formatStandingsForTable = (standings: PairStanding[]) => {
  return standings.map((s) => ({
    pos: s.posicion,
    pareja: s.pairName,
    PJ: s.PJ,
    PG: s.PG,
    PE: s.PE,
    PP: s.PP,
    ptsFav: s.juegosFavor,
    ptsCon: s.juegosContra,
    dif: formatStandingDif(
      computeStandingDif(s.juegosFavor, s.juegosContra)
    ),
    puntos: s.puntos,
  }));
};
