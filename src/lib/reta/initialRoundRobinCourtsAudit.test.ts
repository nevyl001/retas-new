/**
 * Auditoría de seguridad funcional (2026-08-04), punto 1: ¿puede
 * "Alineación dinámica" reutilizar `CircleRoundRobinScheduler.
 * generateTeamsSchedule` para el Round Robin inicial cuando hay MENOS
 * canchas que parejas por equipo?
 *
 * Este archivo reproduce la fórmula EXACTA de esa función (código real en
 * `src/components/CircleRoundRobinScheduler.tsx:76-160`, sin exportarla —
 * es `private static`) para poder auditarla con datos concretos sin
 * depender de Supabase. NO se modifica el scheduler clásico -- Equipos
 * clásico no se toca.
 *
 * Hallazgo (ver informe): cuando `courts < pairsPerTeam` y ambos equipos
 * tienen el mismo número de parejas, el bucle interno
 * `for (let i = 0; i < matchesPerRound; i++)` SOLO itera `i` hasta
 * `matchesPerRound = min(n, courts)` -- nunca hasta `n` (parejas por
 * equipo). Como el equipo indexado directamente (`team0First`) usa
 * `team0Pairs[i]` sin rotación, cualquier pareja con índice
 * `>= matchesPerRound` JAMÁS aparece en ningún partido, mientras que
 * `totalRounds = ceil(n²/matchesPerRound)` genera más "rondas" de las que
 * existen parejas, repitiendo otros cruces. No es "repartir en tandas
 * dentro de la misma ronda deportiva" -- es cobertura incompleta real.
 *
 * Por eso `courts >= pairsPerTeam` se mantiene como requisito para activar
 * Alineación dinámica (ver `RoundRobinPrepWorkspace.tsx` /
 * `useTournamentActions.tsx`): no es una restricción arbitraria, es la
 * única forma de que el Round Robin inicial reutilizado del scheduler
 * clásico sea correcto.
 */

export {};

interface SimulatedMatch {
  round: number;
  team0Idx: number;
  team1Idx: number;
}

/** Reproduce generateTeamsSchedule() para n0 === n1 (mismo número de parejas por equipo). */
function simulateClassicTeamsSchedule(pairsPerTeam: number, courts: number): SimulatedMatch[] {
  const n0 = pairsPerTeam;
  const n1 = pairsPerTeam;
  const n = Math.min(n0, n1);
  const matchesPerRound = Math.min(n, courts);
  const totalRounds = Math.ceil((n0 * n1) / matchesPerRound);
  const team0First = n0 <= n1;

  const matches: SimulatedMatch[] = [];
  for (let r = 1; r <= totalRounds; r++) {
    for (let i = 0; i < matchesPerRound; i++) {
      const team0Idx = team0First ? i : (i + (r - 1)) % n0;
      const team1Idx = team0First ? (i + (r - 1)) % n1 : i;
      matches.push({ round: r, team0Idx, team1Idx });
    }
  }
  return matches;
}

describe("Auditoría: CircleRoundRobinScheduler.generateTeamsSchedule con courts < pairsPerTeam", () => {
  it("3 parejas/equipo + 2 canchas: deja a una pareja del equipo indexado directamente sin jugar NUNCA", () => {
    const matches = simulateClassicTeamsSchedule(3, 2);
    const team0IndicesPlayed = new Set(matches.map((m) => m.team0Idx));
    expect(team0IndicesPlayed.size).toBeLessThan(3);
    expect(team0IndicesPlayed.has(2)).toBe(false); // la 3ra pareja de "equipo0" nunca aparece
  });

  it("4 parejas/equipo + 2 canchas: 2 de las 4 parejas del equipo indexado directamente nunca juegan", () => {
    const matches = simulateClassicTeamsSchedule(4, 2);
    const team0IndicesPlayed = new Set(matches.map((m) => m.team0Idx));
    expect(team0IndicesPlayed.size).toBe(2); // solo índices 0 y 1 (matchesPerRound=2)
  });

  it("4 parejas/equipo + 3 canchas: sigue sin cubrir a todas las parejas (courts < pairsPerTeam)", () => {
    const matches = simulateClassicTeamsSchedule(4, 3);
    const team0IndicesPlayed = new Set(matches.map((m) => m.team0Idx));
    expect(team0IndicesPlayed.size).toBeLessThan(4);
  });

  it("control positivo: con courts >= pairsPerTeam SÍ cubre todos los cruces exactamente una vez", () => {
    const matches = simulateClassicTeamsSchedule(4, 4);
    const team0IndicesPlayed = new Set(matches.map((m) => m.team0Idx));
    const team1IndicesPlayed = new Set(matches.map((m) => m.team1Idx));
    expect(team0IndicesPlayed.size).toBe(4);
    expect(team1IndicesPlayed.size).toBe(4);
    const combos = new Set(matches.map((m) => `${m.team0Idx}-${m.team1Idx}`));
    expect(combos.size).toBe(16); // 4x4, cobertura completa
    expect(Math.max(...matches.map((m) => m.round))).toBe(4); // exactamente pairsPerTeam rondas
  });
});
