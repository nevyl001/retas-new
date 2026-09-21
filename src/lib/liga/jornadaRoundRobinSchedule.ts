/**
 * Calendario todos-contra-todos de una jornada (parejas individuales).
 * Usa 1-factorización (método del círculo) para que cada ronda use el
 * máximo de canchas posible — el empaquetado greedy dejaba huecos
 * (p.ej. 3 canchas → rondas con solo 2 partidos).
 */

export type JornadaPairing = { p1: string; p2: string };

export type JornadaScheduledMatch = JornadaPairing & {
  ronda: number;
  cancha: number;
};

/** Descompone K_n en 1-factores (cada pareja aparece ≤1 vez por ronda). */
export function buildPairOneFactorization(
  pairIds: string[]
): JornadaPairing[][] {
  const n = pairIds.length;
  if (n < 2) return [];

  const isOdd = n % 2 === 1;
  const teams: Array<string | null> = isOdd ? [...pairIds, null] : [...pairIds];
  const m = teams.length; // siempre par
  const rounds = m - 1;
  const half = m / 2;
  const arr = teams.slice();
  const factors: JornadaPairing[][] = [];

  for (let r = 0; r < rounds; r += 1) {
    const round: JornadaPairing[] = [];
    for (let i = 0; i < half; i += 1) {
      const a = arr[i];
      const b = arr[m - 1 - i];
      if (a != null && b != null) {
        round.push({ p1: a, p2: b });
      }
    }
    factors.push(round);
    // Rota todos excepto el primero (método del círculo).
    const last = arr.pop();
    if (last !== undefined) arr.splice(1, 0, last);
  }

  return factors;
}

function getUsoCanchas(
  usoPorPareja: Map<string, number[]>,
  parejaId: string,
  numCanchas: number
): number[] {
  let u = usoPorPareja.get(parejaId);
  if (!u || u.length !== numCanchas) {
    u = Array.from({ length: numCanchas }, () => 0);
    usoPorPareja.set(parejaId, u);
  }
  return u;
}

function elegirCanchaRotando(
  enf: JornadaPairing,
  canchasOcupadasEnRonda: Set<number>,
  usoPorPareja: Map<string, number[]>,
  ultimaCancha: Map<string, number>,
  numCanchas: number,
  ronda: number
): number {
  const candidatas: { cancha: number; score: number }[] = [];

  for (let c = 1; c <= numCanchas; c += 1) {
    if (canchasOcupadasEnRonda.has(c)) continue;
    const u1 = getUsoCanchas(usoPorPareja, enf.p1, numCanchas);
    const u2 = getUsoCanchas(usoPorPareja, enf.p2, numCanchas);
    candidatas.push({ cancha: c, score: u1[c - 1] + u2[c - 1] });
  }

  if (candidatas.length === 0) {
    throw new Error("No hay cancha libre en esta ronda.");
  }

  const minScore = Math.min(...candidatas.map((x) => x.score));
  const mejores = candidatas.filter((x) => x.score === minScore);

  mejores.sort((a, b) => {
    const ultA1 = ultimaCancha.get(enf.p1);
    const ultA2 = ultimaCancha.get(enf.p2);
    const repA =
      (ultA1 === a.cancha ? 1 : 0) + (ultA2 === a.cancha ? 1 : 0);
    const repB =
      (ultA1 === b.cancha ? 1 : 0) + (ultA2 === b.cancha ? 1 : 0);
    if (repA !== repB) return repA - repB;
    const rotA = (a.cancha + ronda) % numCanchas;
    const rotB = (b.cancha + ronda) % numCanchas;
    return rotA - rotB;
  });

  return mejores[0].cancha;
}

function registrarCanchaPareja(
  parejaId: string,
  cancha: number,
  usoPorPareja: Map<string, number[]>,
  ultimaCancha: Map<string, number>,
  numCanchas: number
): void {
  const u = getUsoCanchas(usoPorPareja, parejaId, numCanchas);
  u[cancha - 1] += 1;
  ultimaCancha.set(parejaId, cancha);
}

/**
 * Asigna ronda + cancha a todos los cruces.
 * Cada ronda horaria tiene como máximo `canchasDisponibles` partidos
 * y llena canchas siempre que queden suficientes parejas libres.
 */
export function scheduleJornadaRoundRobin(
  pairIds: string[],
  canchasDisponibles: number
): JornadaScheduledMatch[] {
  const courts = Math.max(1, Math.floor(canchasDisponibles) || 1);
  if (pairIds.length < 2) return [];

  const factors = buildPairOneFactorization(pairIds);
  const usoPorPareja = new Map<string, number[]>();
  const ultimaCancha = new Map<string, number>();
  const scheduled: JornadaScheduledMatch[] = [];
  let ronda = 1;

  for (const factor of factors) {
    for (let offset = 0; offset < factor.length; offset += courts) {
      const chunk = factor.slice(offset, offset + courts);
      const canchasOcupadas = new Set<number>();

      for (const enf of chunk) {
        const cancha = elegirCanchaRotando(
          enf,
          canchasOcupadas,
          usoPorPareja,
          ultimaCancha,
          courts,
          ronda
        );
        canchasOcupadas.add(cancha);
        registrarCanchaPareja(
          enf.p1,
          cancha,
          usoPorPareja,
          ultimaCancha,
          courts
        );
        registrarCanchaPareja(
          enf.p2,
          cancha,
          usoPorPareja,
          ultimaCancha,
          courts
        );
        scheduled.push({
          p1: enf.p1,
          p2: enf.p2,
          ronda,
          cancha,
        });
      }

      ronda += 1;
    }
  }

  return scheduled;
}
