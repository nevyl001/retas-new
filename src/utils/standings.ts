/**
 * RivieraApp — Motor de clasificación (tabla general).
 * Orden: 1) FAV  2) DIF  3) H2H  4) PG.
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
  /** Orden de ronda (americano); si falta, se usa el orden del array. */
  roundNumber?: number;
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
 * Suma cruces; si empatan victorias y games, gana quien ganó el último cruce.
 */
export function getHeadToHead(
  idA: string,
  idB: string,
  historialPartidos: MatchResult[]
): number {
  const confrontaciones = historialPartidos
    .map((p, index) => ({ p, index }))
    .filter(
      ({ p }) =>
        (p.pairAId === idA && p.pairBId === idB) ||
        (p.pairAId === idB && p.pairBId === idA)
    )
    .sort((x, y) => {
      const rA = x.p.roundNumber ?? x.index;
      const rB = y.p.roundNumber ?? y.index;
      return rA - rB;
    })
    .map(({ p }) => p);

  if (confrontaciones.length === 0) return 0;

  let winsA = 0;
  let winsB = 0;
  let gamesA = 0;
  let gamesB = 0;

  const winnerOf = (partido: MatchResult): string | null => {
    const aOnSideA = partido.pairAId === idA;
    const gA = aOnSideA ? partido.gamesA : partido.gamesB;
    const gB = aOnSideA ? partido.gamesB : partido.gamesA;
    if (partido.winnerId === idA || partido.winnerId === idB) {
      return partido.winnerId;
    }
    if (gA > gB) return idA;
    if (gB > gA) return idB;
    return null;
  };

  for (const partido of confrontaciones) {
    const aOnSideA = partido.pairAId === idA;
    const gA = aOnSideA ? partido.gamesA : partido.gamesB;
    const gB = aOnSideA ? partido.gamesB : partido.gamesA;
    gamesA += gA;
    gamesB += gB;

    const ganador = winnerOf(partido);
    if (ganador === idA) winsA += 1;
    else if (ganador === idB) winsB += 1;
  }

  if (winsA !== winsB) return winsB - winsA;
  if (gamesA !== gamesB) return gamesB - gamesA;

  const ultimo = confrontaciones[confrontaciones.length - 1];
  const ganadorUltimo = winnerOf(ultimo);
  if (ganadorUltimo === idA) return -1;
  if (ganadorUltimo === idB) return 1;
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
    const h2h = getHeadToHead(a.pairId, b.pairId, matches);
    if (h2h !== 0) return h2h;
    if (b.PG !== a.PG) return b.PG - a.PG;
    return a.seed - b.seed;
  };
};

/** Alias: ordena por FAV → DIF → H2H → PG. */
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
