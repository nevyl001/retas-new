/**
 * RivieraApp — Motor de clasificación (tabla general).
 * Orden: 1) FAV  2) DIF  3) PG  4) H2H.
 * PTS = PG×2 (solo visual, no ordena).
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
  /** Ganador explícito (p. ej. ganador_id en torneo express). */
  winnerId?: string | null;
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

/** PTS de tabla: 2 por victoria, 0 por derrota (no se usa para ordenar). */
export const calcularPuntos = (pg: number, _pe = 0): number => pg * 2;

export function resolveMatchWinner(match: MatchResult): string | null {
  if (match.winnerId) return match.winnerId;
  if (match.gamesA > match.gamesB) return match.pairAId;
  if (match.gamesB > match.gamesA) return match.pairBId;
  return null;
}

/**
 * Enfrentamiento directo para sort: -1 si A va primero, 1 si B, 0 si empate.
 * Usa el primer partido encontrado entre ambas parejas.
 */
export function getHeadToHead(
  idA: string,
  idB: string,
  historialPartidos: MatchResult[]
): number {
  const partido = historialPartidos.find(
    (p) =>
      (p.pairAId === idA && p.pairBId === idB) ||
      (p.pairAId === idB && p.pairBId === idA)
  );
  if (!partido) return 0;

  const ganador = resolveMatchWinner(partido);
  if (ganador === idA) return -1;
  if (ganador === idB) return 1;
  return 0;
}

/** @deprecated Usar getHeadToHead */
export function getHeadToHeadWinner(
  pairAId: string,
  pairBId: string,
  matches: MatchResult[]
): string | null {
  const cmp = getHeadToHead(pairAId, pairBId, matches);
  if (cmp < 0) return pairAId;
  if (cmp > 0) return pairBId;
  return null;
}

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

    const winner = resolveMatchWinner(match);
    if (winner === match.pairAId) {
      a.PG++;
      b.PP++;
    } else if (winner === match.pairBId) {
      b.PG++;
      a.PP++;
    } else {
      a.PE++;
      b.PE++;
    }
  });

  Object.values(statsMap).forEach((stats) => {
    stats.diferencia = stats.juegosFavor - stats.juegosContra;
    stats.puntos = calcularPuntos(stats.PG);
  });

  const result = Object.values(statsMap);
  if (process.env.NODE_ENV === "development") {
    validateStandings(result, matches);
  }
  return result;
};

/** Alias: recalcula FAV, CON, DIF, PG, PP, PTS desde el historial. */
export function calcularEstadisticas(
  pairs: Array<{ id: string; name: string; seed?: number }>,
  historialPartidos: MatchResult[]
): PairStanding[] {
  return buildStandings(pairs, historialPartidos);
}

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
      s.puntos === s.PG * 2,
      `[standings] ${s.pairName}: PTS incorrectos`
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
}

export const createStandingsComparator = (matches: MatchResult[]) => {
  return (a: PairStanding, b: PairStanding): number => {
    if (b.juegosFavor !== a.juegosFavor) return b.juegosFavor - a.juegosFavor;
    if (b.diferencia !== a.diferencia) return b.diferencia - a.diferencia;
    if (b.PG !== a.PG) return b.PG - a.PG;
    const h2h = getHeadToHead(a.pairId, b.pairId, matches);
    if (h2h !== 0) return h2h;
    return 0;
  };
};

/** Alias: ordena por FAV → DIF → PG → H2H. */
export function ordenarTabla(
  parejas: PairStanding[],
  historialPartidos: MatchResult[]
): PairStanding[] {
  return sortStandings(parejas, historialPartidos);
}

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
  const standings = calcularEstadisticas(pairs, matches);
  return ordenarTabla(standings, matches);
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
