import type { Pair, Match } from "../database";
import {
  comparePlayerPerformance,
  computePlayerPerformance,
  computePartnerCounts,
  computeIndividualOpponentCounts,
  selectBalancedPairsForTeam,
  matchDynamicRoundPairs,
  buildDynamicRoundMatches,
  buildInitialRoundRobinIndexSchedule,
  resolveDynamicBlockRoundRange,
  resolveTotalDynamicBlocks,
  buildInitialDynamicLineupBlock,
  generateDynamicTeamsBlock,
  canGenerateNextDynamicBlock,
  computeDynamicTeamStandings,
  compareDynamicTeamStandings,
  resolveDynamicTeamWinner,
  evaluateDynamicLineupsEligibility,
  type PlayerPerformance,
} from "./dynamicTeamLineups";
import type { PairWithStats } from "../standingsUtils";

const seedOf = (id: string) => id.charCodeAt(0);

function perf(
  playerId: string,
  gamesFor: number,
  gamesAgainst: number,
  matchesWon: number
): PlayerPerformance {
  return {
    playerId,
    gamesFor,
    gamesAgainst,
    gameDifference: gamesFor - gamesAgainst,
    matchesWon,
    matchesLost: 0,
    matchesDrawn: 0,
  };
}

function perfMap(...players: PlayerPerformance[]): Map<string, PlayerPerformance> {
  return new Map(players.map((p) => [p.playerId, p]));
}

function pairWithStats(
  overrides: Partial<PairWithStats> & Pick<PairWithStats, "id" | "player1_id" | "player2_id">
): PairWithStats {
  return {
    tournament_id: "t1",
    player1_name: "",
    player2_name: "",
    created_at: "",
    gamesWon: 0,
    gamesLost: 0,
    setsWon: 0,
    setsLost: 0,
    points: 0,
    pointsReceived: 0,
    matchesPlayed: 0,
    pg: 0,
    pp: 0,
    pe: 0,
    puntosTorneo: 0,
    ...overrides,
  };
}

function realPair(id: string, player1Id: string, player2Id: string): Pair {
  return {
    id,
    tournament_id: "t1",
    player1_id: player1Id,
    player2_id: player2Id,
    player1_name: player1Id,
    player2_name: player2Id,
    created_at: "",
  };
}

describe("comparePlayerPerformance (caso 18)", () => {
  it("ordena por games a favor, luego diferencia, luego partidos ganados", () => {
    const a = perf("A", 20, 10, 3);
    const b = perf("B", 25, 5, 1);
    expect(comparePlayerPerformance(a, b, seedOf)).toBeGreaterThan(0);
  });

  it("con games a favor iguales, desempata por diferencia", () => {
    const a = perf("A", 20, 15, 3);
    const b = perf("B", 20, 10, 1);
    expect(comparePlayerPerformance(a, b, seedOf)).toBeGreaterThan(0);
  });

  it("con games y diferencia iguales, desempata por partidos ganados", () => {
    const a = perf("A", 20, 10, 1);
    const b = perf("B", 20, 10, 3);
    expect(comparePlayerPerformance(a, b, seedOf)).toBeGreaterThan(0);
  });

  it("empate exacto usa un seed estable, nunca aleatorio", () => {
    const a = perf("A", 20, 10, 3);
    const b = perf("B", 20, 10, 3);
    const r1 = comparePlayerPerformance(a, b, seedOf);
    const r2 = comparePlayerPerformance(a, b, seedOf);
    expect(r1).toBe(r2);
    expect(r1).toBeLessThan(0);
  });
});

describe("computePlayerPerformance", () => {
  it("agrega games/partidos de cada pareja a ambos jugadores", () => {
    const pairs: PairWithStats[] = [
      pairWithStats({ id: "p1", player1_id: "A", player2_id: "B", points: 12, pointsReceived: 7, pg: 1, pp: 0 }),
      pairWithStats({ id: "p2", player1_id: "A", player2_id: "C", points: 8, pointsReceived: 9, pg: 0, pp: 1 }),
    ];
    const result = computePlayerPerformance(pairs);
    const a = result.get("A")!;
    expect(a.gamesFor).toBe(20);
    expect(a.gamesAgainst).toBe(16);
    expect(a.gameDifference).toBe(4);
    expect(a.matchesWon).toBe(1);
    expect(a.matchesLost).toBe(1);
  });
});

describe("computePartnerCounts / computeIndividualOpponentCounts", () => {
  it("cuenta cuántas veces cada pareja canónica ya fue compañera", () => {
    const pairs: Pair[] = [
      realPair("p1", "A", "B"),
      realPair("p2", "C", "D"),
      realPair("p3", "A", "B"), // misma pareja repetida en otro bloque
    ];
    const counts = computePartnerCounts(pairs);
    expect(counts.get("A+B")).toBe(2);
    expect(counts.get("C+D")).toBe(1);
  });

  it("cuenta cuántas veces cada par de rivales individuales ya se enfrentó", () => {
    const pairs: Pair[] = [realPair("p1", "A", "B"), realPair("p2", "C", "D")];
    const matches: Match[] = [
      {
        id: "m1",
        tournament_id: "t1",
        pair1_id: "p1",
        pair2_id: "p2",
        pair1_name: "",
        pair2_name: "",
        court: 1,
        round: 1,
        status: "finished",
        created_at: "",
      },
    ];
    const counts = computeIndividualOpponentCounts(pairs, matches);
    expect(counts.get("A+C")).toBe(1);
    expect(counts.get("A+D")).toBe(1);
    expect(counts.get("B+C")).toBe(1);
    expect(counts.get("B+D")).toBe(1);
  });
});

describe("selectBalancedPairsForTeam (generalizado a 2N jugadores, casos 18-23)", () => {
  it("con 4 jugadores (N=2), forma fuerte+débil (rank1+rank4, rank2+rank3) — caso 19", () => {
    const players = ["A", "B", "C", "D"];
    const performance = perfMap(
      perf("A", 40, 10, 4),
      perf("B", 25, 20, 2),
      perf("C", 22, 20, 2),
      perf("D", 10, 30, 0)
    );
    const result = selectBalancedPairsForTeam({
      players,
      performance,
      partnerCounts: new Map(),
      previousRoundPairKeys: [],
    });
    const keys = result.pairs.map((p) => [...p].sort().join("+")).sort();
    expect(keys).toEqual(["A+D", "B+C"]);
  });

  it("con 6 jugadores (N=3) forma exactamente 3 parejas válidas, sin mezclar equipos (caso 20)", () => {
    const players = ["A", "B", "C", "D", "E", "F"];
    const performance = perfMap(
      perf("A", 30, 10, 3),
      perf("B", 25, 15, 2),
      perf("C", 20, 20, 1),
      perf("D", 18, 22, 1),
      perf("E", 12, 28, 0),
      perf("F", 8, 32, 0)
    );
    const result = selectBalancedPairsForTeam({
      players,
      performance,
      partnerCounts: new Map(),
      previousRoundPairKeys: [],
    });
    expect(result.pairs).toHaveLength(3);
    const flat = result.pairs.flat().sort();
    expect(flat).toEqual([...players].sort());
  });

  it("con 8 jugadores (N=4) forma exactamente 4 parejas válidas", () => {
    const players = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const result = selectBalancedPairsForTeam({
      players,
      performance: new Map(),
      partnerCounts: new Map(),
      previousRoundPairKeys: [],
    });
    expect(result.pairs).toHaveLength(4);
    const flat = result.pairs.flat().sort();
    expect(flat).toEqual([...players].sort());
  });

  it("evita repetir compañero cuando existe una combinación alternativa (N=3, caso 21)", () => {
    const players = ["A", "B", "C", "D", "E", "F"];
    const previousRoundPairKeys = ["A+B", "C+D", "E+F"];
    const result = selectBalancedPairsForTeam({
      players,
      performance: new Map(),
      partnerCounts: new Map(),
      previousRoundPairKeys,
    });
    const resultKeys = result.pairs.map((p) => [...p].sort().join("+"));
    const overlap = resultKeys.filter((k) => previousRoundPairKeys.includes(k));
    expect(overlap).toHaveLength(0);
    expect(result.wasImmediateRepeat).toBe(false);
  });

  it("prioriza no repetir sobre repeticiones históricas menores (N=2, caso 21/22)", () => {
    const players = ["A", "B", "C", "D"];
    const performance = perfMap(
      perf("A", 30, 10, 3),
      perf("B", 25, 15, 2),
      perf("C", 20, 20, 1),
      perf("D", 15, 25, 0)
    );
    const partnerCounts = new Map([["A+D", 5]]); // A+D ya fue compañera muchas veces
    const result = selectBalancedPairsForTeam({
      players,
      performance,
      partnerCounts,
      previousRoundPairKeys: ["A+D"], // y es la pareja inmediatamente anterior
    });
    const resultKeys = result.pairs.map((p) => [...p].sort().join("+"));
    expect(resultKeys).not.toContain("A+D");
  });

  it("agotadas las combinaciones sin repetición, repite (N=2, caso 22)", () => {
    const players = ["A", "B", "C", "D"];
    const performance = new Map<string, PlayerPerformance>();
    // Las 3 combinaciones posibles de 4 jugadores ya se usaron.
    const previousRoundPairKeys = ["A+B", "A+C", "A+D"]; // no exhaustivo, pero cubre todas las parejas posibles con A
    const partnerCounts = new Map([
      ["A+B", 1],
      ["C+D", 1],
      ["A+C", 1],
      ["B+D", 1],
      ["A+D", 1],
      ["B+C", 1],
    ]);
    const result = selectBalancedPairsForTeam({
      players,
      performance,
      partnerCounts,
      previousRoundPairKeys,
    });
    expect(result.pairs).toHaveLength(2);
    const flat = result.pairs.flat().sort();
    expect(flat).toEqual(["A", "B", "C", "D"]);
  });

  it("es determinista: mismo input produce siempre el mismo resultado (recargar no cambia la alineación)", () => {
    const players = ["A", "B", "C", "D", "E", "F"];
    const performance = perfMap(
      perf("A", 30, 10, 3),
      perf("B", 25, 15, 2),
      perf("C", 20, 20, 1),
      perf("D", 18, 22, 1),
      perf("E", 12, 28, 0),
      perf("F", 8, 32, 0)
    );
    const partnerCounts = new Map([["A+F", 2]]);
    const previousRoundPairKeys = ["B+E"];
    const r1 = selectBalancedPairsForTeam({ players, performance, partnerCounts, previousRoundPairKeys });
    const r2 = selectBalancedPairsForTeam({ players, performance, partnerCounts, previousRoundPairKeys });
    expect(r1.partitionKey).toBe(r2.partitionKey);
  });

  it("rechaza una cantidad impar de jugadores", () => {
    expect(() =>
      selectBalancedPairsForTeam({
        players: ["A", "B", "C"],
        performance: new Map(),
        partnerCounts: new Map(),
        previousRoundPairKeys: [],
      })
    ).toThrow();
  });
});

describe("matchDynamicRoundPairs (cruce de parejas dinámicas)", () => {
  it("empareja N parejas 1 a 1 sin dejar ninguna sin cruzar (N=3)", () => {
    const teamAPairs: Array<[string, string]> = [
      ["A1", "A2"],
      ["A3", "A4"],
      ["A5", "A6"],
    ];
    const teamBPairs: Array<[string, string]> = [
      ["B1", "B2"],
      ["B3", "B4"],
      ["B5", "B6"],
    ];
    const assignments = matchDynamicRoundPairs({
      teamAPairs,
      teamBPairs,
      opponentCounts: new Map(),
    });
    expect(assignments).toHaveLength(3);
    const usedA = new Set(assignments.map((a) => a.teamAPair.join("+")));
    const usedB = new Set(assignments.map((a) => a.teamBPair.join("+")));
    expect(usedA.size).toBe(3);
    expect(usedB.size).toBe(3);
  });

  it("evita rivales repetidos cuando existe una alternativa de costo menor", () => {
    const teamAPairs: Array<[string, string]> = [
      ["A1", "A2"],
      ["A3", "A4"],
      ["A5", "A6"],
    ];
    const teamBPairs: Array<[string, string]> = [
      ["B1", "B2"],
      ["B3", "B4"],
      ["B5", "B6"],
    ];
    const opponentCounts = new Map([["A1+B1", 5]]);
    const assignments = matchDynamicRoundPairs({ teamAPairs, teamBPairs, opponentCounts });
    const match = assignments.find((a) => a.teamAPair.includes("A1"))!;
    expect(match.teamBPair).not.toEqual(["B1", "B2"]);
  });

  it("es determinista", () => {
    const teamAPairs: Array<[string, string]> = [
      ["A1", "A2"],
      ["A3", "A4"],
    ];
    const teamBPairs: Array<[string, string]> = [
      ["B1", "B2"],
      ["B3", "B4"],
    ];
    const r1 = matchDynamicRoundPairs({ teamAPairs, teamBPairs, opponentCounts: new Map() });
    const r2 = matchDynamicRoundPairs({ teamAPairs, teamBPairs, opponentCounts: new Map() });
    expect(r1).toEqual(r2);
  });
});

describe("buildDynamicRoundMatches (calendario de una ronda dinámica)", () => {
  it("con N parejas por equipo genera N partidos, una sola ronda", () => {
    const teamAPairs: Array<[string, string]> = [
      ["A1", "A2"],
      ["A3", "A4"],
      ["A5", "A6"],
    ];
    const teamBPairs: Array<[string, string]> = [
      ["B1", "B2"],
      ["B3", "B4"],
      ["B5", "B6"],
    ];
    const matches = buildDynamicRoundMatches(teamAPairs, teamBPairs, new Map(), 3, 4);
    expect(matches).toHaveLength(3);
    expect(matches.every((m) => m.round === 4)).toBe(true);
  });

  it("no genera ningún partido intraequipo", () => {
    const teamAPairs: Array<[string, string]> = [
      ["A1", "A2"],
      ["A3", "A4"],
    ];
    const teamBPairs: Array<[string, string]> = [
      ["B1", "B2"],
      ["B3", "B4"],
    ];
    const matches = buildDynamicRoundMatches(teamAPairs, teamBPairs, new Map(), 2, 3);
    matches.forEach((m) => {
      const overlap = m.teamAPair.filter((p) => (m.teamBPair as string[]).includes(p));
      expect(overlap).toHaveLength(0);
    });
  });
});

describe("buildInitialRoundRobinIndexSchedule (Round Robin inicial, N parejas por equipo)", () => {
  [2, 3, 4, 5].forEach((n) => {
    it(`con ${n} parejas por equipo: ${n} rondas, ${n} partidos por ronda, cobertura completa`, () => {
      const schedule = buildInitialRoundRobinIndexSchedule(n);
      expect(schedule).toHaveLength(n * n);

      const rounds = new Set(schedule.map((m) => m.round));
      expect(rounds.size).toBe(n);

      for (let r = 1; r <= n; r++) {
        const roundMatches = schedule.filter((m) => m.round === r);
        expect(roundMatches).toHaveLength(n);
        const aIdx = roundMatches.map((m) => m.teamAPairIndex).sort((x, y) => x - y);
        const bIdx = roundMatches.map((m) => m.teamBPairIndex).sort((x, y) => x - y);
        const expectedIdx = Array.from({ length: n }, (_, i) => i);
        expect(aIdx).toEqual(expectedIdx);
        expect(bIdx).toEqual(expectedIdx);
      }

      const combos = new Set(schedule.map((m) => `${m.teamAPairIndex}-${m.teamBPairIndex}`));
      expect(combos.size).toBe(n * n);
    });
  });
});

describe("resolveDynamicBlockRoundRange / resolveTotalDynamicBlocks (generalización por pairsPerTeam)", () => {
  it("2 parejas + 5 rondas -> 2 iniciales + 3 dinámicas", () => {
    expect(resolveTotalDynamicBlocks(5, 2)).toBe(4);
    expect(resolveDynamicBlockRoundRange(1, 2)).toEqual({ roundStart: 1, roundEnd: 2, stage: "initial_round_robin" });
    expect(resolveDynamicBlockRoundRange(2, 2)).toEqual({ roundStart: 3, roundEnd: 3, stage: "dynamic_round" });
    expect(resolveDynamicBlockRoundRange(3, 2)).toEqual({ roundStart: 4, roundEnd: 4, stage: "dynamic_round" });
    expect(resolveDynamicBlockRoundRange(4, 2)).toEqual({ roundStart: 5, roundEnd: 5, stage: "dynamic_round" });
  });

  it("3 parejas + 5 rondas -> 3 iniciales + 2 dinámicas", () => {
    expect(resolveTotalDynamicBlocks(5, 3)).toBe(3);
    expect(resolveDynamicBlockRoundRange(1, 3)).toEqual({ roundStart: 1, roundEnd: 3, stage: "initial_round_robin" });
    expect(resolveDynamicBlockRoundRange(2, 3)).toEqual({ roundStart: 4, roundEnd: 4, stage: "dynamic_round" });
    expect(resolveDynamicBlockRoundRange(3, 3)).toEqual({ roundStart: 5, roundEnd: 5, stage: "dynamic_round" });
  });

  it("4 parejas + 5 rondas -> 4 iniciales + 1 dinámica", () => {
    expect(resolveTotalDynamicBlocks(5, 4)).toBe(2);
    expect(resolveDynamicBlockRoundRange(1, 4)).toEqual({ roundStart: 1, roundEnd: 4, stage: "initial_round_robin" });
    expect(resolveDynamicBlockRoundRange(2, 4)).toEqual({ roundStart: 5, roundEnd: 5, stage: "dynamic_round" });
  });

  it("5 parejas + 5 rondas -> solo Round Robin inicial (sin dinámicas)", () => {
    expect(resolveTotalDynamicBlocks(5, 5)).toBe(1);
    expect(resolveDynamicBlockRoundRange(1, 5)).toEqual({ roundStart: 1, roundEnd: 5, stage: "initial_round_robin" });
  });

  it("4 parejas + 7 rondas -> 4 iniciales + 3 dinámicas", () => {
    expect(resolveTotalDynamicBlocks(7, 4)).toBe(4);
    expect(resolveDynamicBlockRoundRange(1, 4)).toEqual({ roundStart: 1, roundEnd: 4, stage: "initial_round_robin" });
    expect(resolveDynamicBlockRoundRange(2, 4)).toEqual({ roundStart: 5, roundEnd: 5, stage: "dynamic_round" });
    expect(resolveDynamicBlockRoundRange(3, 4)).toEqual({ roundStart: 6, roundEnd: 6, stage: "dynamic_round" });
    expect(resolveDynamicBlockRoundRange(4, 4)).toEqual({ roundStart: 7, roundEnd: 7, stage: "dynamic_round" });
  });
});

describe("buildInitialDynamicLineupBlock / generateDynamicTeamsBlock (integración, N genérico)", () => {
  it("bloque 1 (N=3) conserva las parejas originales tal cual, sin balancear", () => {
    const plan = buildInitialDynamicLineupBlock({
      pairsPerTeam: 3,
      teamA: {
        teamIndex: 0,
        pairs: [
          ["A", "B"],
          ["C", "D"],
          ["E", "F"],
        ],
      },
      teamB: {
        teamIndex: 1,
        pairs: [
          ["G", "H"],
          ["I", "J"],
          ["K", "L"],
        ],
      },
    });
    expect(plan.blockNumber).toBe(1);
    expect(plan.stage).toBe("initial_round_robin");
    expect(plan.roundStart).toBe(1);
    expect(plan.roundEnd).toBe(3);
    expect(plan.teamA.lineup.pairs).toHaveLength(3);
    expect(plan.teamB.lineup.pairs).toHaveLength(3);
  });

  it("bloque dinámico (N=3) genera exactamente pairsPerTeam parejas y partidos por equipo", () => {
    const performance = new Map<string, PlayerPerformance>();
    const plan = generateDynamicTeamsBlock({
      blockNumber: 2,
      pairsPerTeam: 3,
      courts: 3,
      performance,
      opponentCounts: new Map(),
      teamA: {
        teamIndex: 0,
        players: ["A", "B", "C", "D", "E", "F"],
        partnerCounts: new Map(),
        previousRoundPairKeys: [],
      },
      teamB: {
        teamIndex: 1,
        players: ["G", "H", "I", "J", "K", "L"],
        partnerCounts: new Map(),
        previousRoundPairKeys: [],
      },
    });
    expect(plan.stage).toBe("dynamic_round");
    expect(plan.roundStart).toBe(4);
    expect(plan.roundEnd).toBe(4);
    expect(plan.teamA.lineup.pairs).toHaveLength(3);
    expect(plan.teamB.lineup.pairs).toHaveLength(3);
    expect(plan.crossMatches).toHaveLength(3);
    // nunca mezcla jugadores de equipos distintos
    const teamAPlayers = new Set(["A", "B", "C", "D", "E", "F"]);
    plan.crossMatches.forEach((m) => {
      m.teamAPair.forEach((p) => expect(teamAPlayers.has(p)).toBe(true));
      m.teamBPair.forEach((p) => expect(teamAPlayers.has(p)).toBe(false));
    });
  });
});

describe("canGenerateNextDynamicBlock (validaciones, generalizado por pairsPerTeam)", () => {
  const baseMatch = (id: string, status: string): Match => ({
    id,
    tournament_id: "t1",
    pair1_id: "p1",
    pair2_id: "p2",
    pair1_name: "",
    pair2_name: "",
    court: 1,
    round: 1,
    status,
    created_at: "",
  });

  it("no genera el siguiente bloque si falta un resultado del bloque activo", () => {
    const result = canGenerateNextDynamicBlock({
      tournamentFinished: false,
      totalRounds: 5,
      pairsPerTeam: 3,
      currentBlockNumber: 1,
      currentBlockMatches: [baseMatch("m1", "finished"), baseMatch("m2", "pending")],
      nextBlockAlreadyGenerated: false,
    });
    expect(result.canGenerate).toBe(false);
    expect(result.reason).toBe("pending_results");
  });

  it("genera cuando todos los partidos del bloque activo están finalizados", () => {
    const result = canGenerateNextDynamicBlock({
      tournamentFinished: false,
      totalRounds: 5,
      pairsPerTeam: 3,
      currentBlockNumber: 1,
      currentBlockMatches: [baseMatch("m1", "finished")],
      nextBlockAlreadyGenerated: false,
    });
    expect(result.canGenerate).toBe(true);
  });

  it("5 parejas + 5 rondas: no hay bloque dinámico que generar (solo RR inicial)", () => {
    const result = canGenerateNextDynamicBlock({
      tournamentFinished: false,
      totalRounds: 5,
      pairsPerTeam: 5,
      currentBlockNumber: 1,
      currentBlockMatches: [baseMatch("m1", "finished")],
      nextBlockAlreadyGenerated: false,
    });
    expect(result.canGenerate).toBe(false);
    expect(result.reason).toBe("no_more_blocks");
  });

  it("no genera si el bloque siguiente ya existe (idempotencia)", () => {
    const result = canGenerateNextDynamicBlock({
      tournamentFinished: false,
      totalRounds: 5,
      pairsPerTeam: 3,
      currentBlockNumber: 1,
      currentBlockMatches: [baseMatch("m1", "finished")],
      nextBlockAlreadyGenerated: true,
    });
    expect(result.canGenerate).toBe(false);
    expect(result.reason).toBe("already_generated");
  });

  it("no genera sobre una reta finalizada", () => {
    const result = canGenerateNextDynamicBlock({
      tournamentFinished: true,
      totalRounds: 5,
      pairsPerTeam: 3,
      currentBlockNumber: 1,
      currentBlockMatches: [baseMatch("m1", "finished")],
      nextBlockAlreadyGenerated: false,
    });
    expect(result.canGenerate).toBe(false);
    expect(result.reason).toBe("tournament_finished");
  });
});

describe("computeDynamicTeamStandings / compareDynamicTeamStandings (casos 24-29)", () => {
  const teamConfig = {
    teamNames: ["Riviera", "Hack"],
    pairToTeam: { pR1: 0, pR2: 0, pH1: 1, pH2: 1 },
  };

  const pairs: Pair[] = [
    realPair("pR1", "A", "B"),
    realPair("pR2", "C", "D"),
    realPair("pH1", "E", "F"),
    realPair("pH2", "G", "H"),
  ];

  function match(
    id: string,
    pair1Id: string,
    pair2Id: string,
    round: number,
    p1Score: number,
    p2Score: number
  ): Match {
    return {
      id,
      tournament_id: "t1",
      pair1_id: pair1Id,
      pair2_id: pair2Id,
      pair1_name: "",
      pair2_name: "",
      court: 1,
      round,
      status: "finished",
      pair1_score: p1Score,
      pair2_score: p2Score,
      created_at: "",
    };
  }

  it("gana el equipo con más games a favor (caso 24), sin duplicar partidos jugados (caso 28)", () => {
    const matches: Match[] = [match("m1", "pR1", "pH1", 1, 6, 2), match("m2", "pR2", "pH2", 1, 6, 1)];
    const rows = computeDynamicTeamStandings(pairs, matches, [], teamConfig)!;
    expect(rows[0].teamIndex).toBe(0);
    expect(rows[0].matchesPlayed).toBe(2);
    expect(rows[1].matchesPlayed).toBe(2);
  });

  it("empate en games a favor: gana el de mejor diferencia (caso 25, comparador directo)", () => {
    const riviera = { teamIndex: 0, name: "Riviera", gamesFor: 10, gamesAgainst: 5, gameDifference: 5, matchesPlayed: 2, matchesWon: 2, matchesLost: 0 };
    const hack = { teamIndex: 1, name: "Hack", gamesFor: 10, gamesAgainst: 8, gameDifference: 2, matchesPlayed: 2, matchesWon: 1, matchesLost: 1 };
    expect(compareDynamicTeamStandings(riviera, hack)).toBeLessThan(0);
  });

  it("comparador exacto: gamesFor > gameDifference > matchesWon > teamIndex", () => {
    const a = { teamIndex: 1, name: "B", gamesFor: 10, gamesAgainst: 5, gameDifference: 5, matchesPlayed: 2, matchesWon: 1, matchesLost: 1 };
    const b = { teamIndex: 0, name: "A", gamesFor: 10, gamesAgainst: 5, gameDifference: 5, matchesPlayed: 2, matchesWon: 1, matchesLost: 1 };
    expect(compareDynamicTeamStandings(a, b)).toBeGreaterThan(0);
  });

  it("no inventa ganador: 3 criterios empatados -> empate (caso 27, 34)", () => {
    const rows = [
      { teamIndex: 0, name: "Riviera", gamesFor: 10, gamesAgainst: 5, gameDifference: 5, matchesPlayed: 2, matchesWon: 1, matchesLost: 1 },
      { teamIndex: 1, name: "Hack", gamesFor: 10, gamesAgainst: 5, gameDifference: 5, matchesPlayed: 2, matchesWon: 1, matchesLost: 1 },
    ];
    const result = resolveDynamicTeamWinner(rows);
    expect(result.isDraw).toBe(true);
    expect(result.winningTeamIndex).toBeNull();
  });

  it("declara ganador real cuando los criterios no empatan (caso 33)", () => {
    const rows = [
      { teamIndex: 0, name: "Riviera", gamesFor: 15, gamesAgainst: 5, gameDifference: 10, matchesPlayed: 2, matchesWon: 2, matchesLost: 0 },
      { teamIndex: 1, name: "Hack", gamesFor: 10, gamesAgainst: 8, gameDifference: 2, matchesPlayed: 2, matchesWon: 0, matchesLost: 2 },
    ];
    const result = resolveDynamicTeamWinner(rows);
    expect(result.isDraw).toBe(false);
    expect(result.winningTeamIndex).toBe(0);
  });

  it("integración: suma partidos del Round Robin inicial + rondas dinámicas sin duplicar (caso 9)", () => {
    // pR1/pR2/pH1/pH2 = parejas originales (rondas 1-2). pR3/pH3 = parejas
    // NUEVAS creadas para la ronda dinámica 3 (jugadores distintos
    // reagrupados) -- el comparador debe sumar TODO sin distinguir origen.
    const dynamicTeamConfig = {
      teamNames: ["Riviera", "Hack"],
      pairToTeam: { pR1: 0, pR2: 0, pH1: 1, pH2: 1, pR3: 0, pR4: 0, pH3: 1, pH4: 1 },
    };
    const allPairs: Pair[] = [
      ...pairs,
      realPair("pR3", "A", "D"),
      realPair("pR4", "B", "C"),
      realPair("pH3", "E", "H"),
      realPair("pH4", "F", "G"),
    ];
    const allMatches: Match[] = [
      match("m1", "pR1", "pH1", 1, 6, 3),
      match("m2", "pR2", "pH2", 1, 6, 2),
      match("m3", "pR1", "pH2", 2, 6, 4),
      match("m4", "pR2", "pH1", 2, 6, 1),
      match("m5", "pR3", "pH3", 3, 6, 5),
      match("m6", "pR4", "pH4", 3, 6, 2),
    ];
    const rows = computeDynamicTeamStandings(allPairs, allMatches, [], dynamicTeamConfig)!;
    const riviera = rows.find((r) => r.teamIndex === 0)!;
    const hack = rows.find((r) => r.teamIndex === 1)!;
    // 6 filas de partido en total (m1-m6). Cada equipo tiene 2 parejas
    // jugando simultáneamente por ronda -> cada equipo acumula 6
    // "matchesPlayed" (una vez por cada partido real, nunca el doble).
    expect(riviera.matchesPlayed).toBe(6);
    expect(hack.matchesPlayed).toBe(6);
    expect(riviera.matchesPlayed + hack.matchesPlayed).toBe(allMatches.length * 2);
    expect(riviera.gamesFor).toBe(6 + 6 + 6 + 6 + 6 + 6);
    expect(hack.gamesFor).toBe(3 + 2 + 4 + 1 + 5 + 2);
  });
});

describe("selectBalancedPairsForTeam: casos con nombres reales (auditoría punto 6)", () => {
  it("6 jugadores con rendimiento claramente escalonado: parejas razonablemente equilibradas, no junta a los 2 mejores necesariamente", () => {
    const players = ["A", "B", "C", "D", "E", "F"];
    const performance = perfMap(
      perf("A", 50, 10, 5), // alto
      perf("B", 45, 12, 4), // alto
      perf("C", 30, 20, 2), // medio
      perf("D", 28, 22, 2), // medio
      perf("E", 12, 35, 0), // bajo
      perf("F", 10, 38, 0) // bajo
    );
    const result = selectBalancedPairsForTeam({
      players,
      performance,
      partnerCounts: new Map(),
      previousRoundPairKeys: [],
    });
    expect(result.pairs).toHaveLength(3);
    const flat = result.pairs.flat().sort();
    expect(flat).toEqual([...players].sort());
    const keys = result.pairs.map((p) => [...p].sort().join("+"));
    // No es obligatorio que A+B (los 2 mejores) queden juntos -- el
    // best+worst esperado es A+F, B+E, C+D.
    expect(keys.sort()).toEqual(["A+F", "B+E", "C+D"]);
  });

  it("evita compañeros de la ronda anterior cuando es razonablemente posible (6 jugadores)", () => {
    const players = ["A", "B", "C", "D", "E", "F"];
    const performance = perfMap(
      perf("A", 50, 10, 5),
      perf("B", 45, 12, 4),
      perf("C", 30, 20, 2),
      perf("D", 28, 22, 2),
      perf("E", 12, 35, 0),
      perf("F", 10, 38, 0)
    );
    // La ronda anterior fue exactamente el pairing "natural" (A+F, B+E, C+D).
    const previousRoundPairKeys = ["A+F", "B+E", "C+D"];
    const result = selectBalancedPairsForTeam({
      players,
      performance,
      partnerCounts: new Map([
        ["A+F", 1],
        ["B+E", 1],
        ["C+D", 1],
      ]),
      previousRoundPairKeys,
    });
    const keys = result.pairs.map((p) => [...p].sort().join("+"));
    expect(keys.some((k) => previousRoundPairKeys.includes(k))).toBe(false);
    expect(result.wasImmediateRepeat).toBe(false);
  });

  it("8 jugadores: exactamente 4 parejas, todos aparecen una vez, nadie fuera ni duplicado, determinista y sin ciclos", () => {
    const players = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const performance = perfMap(
      perf("A", 60, 10, 6),
      perf("B", 55, 12, 5),
      perf("C", 40, 20, 3),
      perf("D", 38, 22, 3),
      perf("E", 25, 30, 1),
      perf("F", 22, 33, 1),
      perf("G", 10, 45, 0),
      perf("H", 8, 48, 0)
    );
    const partnerCounts = new Map([
      ["A+H", 2],
      ["B+G", 1],
    ]);
    const previousRoundPairKeys = ["A+H", "B+G", "C+F", "D+E"];

    const start = Date.now();
    const r1 = selectBalancedPairsForTeam({ players, performance, partnerCounts, previousRoundPairKeys });
    const r2 = selectBalancedPairsForTeam({ players, performance, partnerCounts, previousRoundPairKeys });
    const elapsedMs = Date.now() - start;

    expect(r1.pairs).toHaveLength(4);
    const flat = r1.pairs.flat().sort();
    expect(flat).toEqual([...players].sort());
    expect(new Set(flat).size).toBe(8); // nadie duplicado
    expect(r1.partitionKey).toBe(r2.partitionKey); // determinista
    expect(elapsedMs).toBeLessThan(1000); // termina rápido, sin ciclos infinitos
  });
});

describe("Costo lexicográfico: caso extremo de desbalance por evitar repetición (auditoría punto 7)", () => {
  it("mide (sin corregir) que priorizar 'menos repeticiones históricas' puede escoger la partición MÁS desbalanceada de las 3", () => {
    // Rendimiento perfectamente escalonado: A=40, B=30, C=20, D=10.
    // Partición ideal por balance puro: A+D / B+C -> desbalance 0.
    // Pero si A+D y A+C ya se repitieron mucho, el algoritmo prioriza
    // repeticiones históricas ANTES que balance -- puede terminar eligiendo
    // A+B / C+D, la partición MÁS desbalanceada de las 3 (40 vs 40 de gap).
    const players = ["A", "B", "C", "D"];
    // gamesAgainst = gamesFor deja gameDifference = 0 para los 4, así el
    // desbalance depende únicamente del término dominante (gamesFor) y da
    // números redondos y fáciles de verificar a mano.
    const performance = perfMap(
      perf("A", 40, 40, 0),
      perf("B", 30, 30, 0),
      perf("C", 20, 20, 0),
      perf("D", 10, 10, 0)
    );
    const partnerCounts = new Map([
      ["A+D", 5], // partición ideal (A+D/B+C), muy repetida
      ["A+C", 3], // segunda mejor partición (A+C/B+D), también repetida
      // A+B/C+D (la peor balanceada) nunca fue compañera -> 0 repeticiones
    ]);

    const result = selectBalancedPairsForTeam({
      players,
      performance,
      partnerCounts,
      previousRoundPairKeys: [],
    });

    const keys = result.pairs.map((p) => [...p].sort().join("+")).sort();
    // Documentado: el algoritmo elige A+B/C+D (imbalance = 40e6, la PEOR de
    // las 3 posibles) precisamente porque es la única con 0 repeticiones
    // históricas -- confirma que el orden de prioridad actual (repeticiones
    // antes que balance) puede producir un desbalance extremo. Esto es el
    // comportamiento vigente, documentado a propósito -- NO se modifica el
    // orden de prioridad sin autorización explícita (ver informe: se
    // recomienda evaluar un límite de desbalance como mejora futura).
    expect(keys).toEqual(["A+B", "C+D"]);
    expect(result.imbalance).toBe(40_000_000); // el peor de los 3 desbalances posibles
  });
});

describe("matchDynamicRoundPairs: tamaños 2, 3, 4 y 5 parejas por equipo (auditoría punto 8)", () => {
  const sizes = [2, 3, 4, 5];

  sizes.forEach((n) => {
    it(`con ${n} parejas por equipo: asignación 1 a 1, nadie repite ni queda sin partido, determinista`, () => {
      const teamAPairs: Array<[string, string]> = Array.from({ length: n }, (_, i) => [
        `A${i * 2 + 1}`,
        `A${i * 2 + 2}`,
      ]);
      const teamBPairs: Array<[string, string]> = Array.from({ length: n }, (_, i) => [
        `B${i * 2 + 1}`,
        `B${i * 2 + 2}`,
      ]);
      const r1 = matchDynamicRoundPairs({ teamAPairs, teamBPairs, opponentCounts: new Map() });
      const r2 = matchDynamicRoundPairs({ teamAPairs, teamBPairs, opponentCounts: new Map() });

      expect(r1).toHaveLength(n);
      const usedA = new Set(r1.map((a) => a.teamAPair.join("+")));
      const usedB = new Set(r1.map((a) => a.teamBPair.join("+")));
      expect(usedA.size).toBe(n);
      expect(usedB.size).toBe(n);
      expect(r1).toEqual(r2); // determinista
    });
  });
});

describe("evaluateDynamicLineupsEligibility: mensaje de canchas (auditoría de seguimiento 2026-08-04, punto 4)", () => {
  function teamsOf(pairsPerTeam: number): Array<{ teamIndex: number; pairs: Pair[] }> {
    const teamA = Array.from({ length: pairsPerTeam }, (_, i) =>
      realPair(`a${i}`, `A${i}x`, `A${i}y`)
    );
    const teamB = Array.from({ length: pairsPerTeam }, (_, i) =>
      realPair(`b${i}`, `B${i}x`, `B${i}y`)
    );
    return [
      { teamIndex: 0, pairs: teamA },
      { teamIndex: 1, pairs: teamB },
    ];
  }

  it("3 parejas por equipo + 2 canchas: NO elegible, explica cuántas se necesitan y cuántas hay", () => {
    const teams = teamsOf(3);
    const result = evaluateDynamicLineupsEligibility({
      isTeams: true,
      teams,
      allPairs: [...teams[0].pairs, ...teams[1].pairs],
      courts: 2,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("3 canchas");
    expect(result.reason).toContain("hay 2 configurada");
    expect(result.reason).not.toBe("Cantidad de canchas inválida");
  });

  it("4 parejas por equipo + 3 canchas: NO elegible (courts < pairsPerTeam)", () => {
    const teams = teamsOf(4);
    const result = evaluateDynamicLineupsEligibility({
      isTeams: true,
      teams,
      allPairs: [...teams[0].pairs, ...teams[1].pairs],
      courts: 3,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("4 canchas");
    expect(result.reason).toContain("hay 3 configurada");
  });

  it("4 parejas por equipo + 4 canchas: SÍ elegible (courts === pairsPerTeam)", () => {
    const teams = teamsOf(4);
    const result = evaluateDynamicLineupsEligibility({
      isTeams: true,
      teams,
      allPairs: [...teams[0].pairs, ...teams[1].pairs],
      courts: 4,
    });
    expect(result).toEqual({ eligible: true, pairsPerTeam: 4 });
  });

  it("courts > pairsPerTeam también es elegible", () => {
    const teams = teamsOf(2);
    const result = evaluateDynamicLineupsEligibility({
      isTeams: true,
      teams,
      allPairs: [...teams[0].pairs, ...teams[1].pairs],
      courts: 6,
    });
    expect(result.eligible).toBe(true);
  });

  it("la validación de canchas no aplica si el formato no es Equipos (isTeams=false)", () => {
    const teams = teamsOf(3);
    const result = evaluateDynamicLineupsEligibility({
      isTeams: false,
      teams,
      allPairs: [...teams[0].pairs, ...teams[1].pairs],
      courts: 1,
    });
    // No elegible, pero por no ser Equipos -- no debe mencionar canchas.
    expect(result.eligible).toBe(false);
    expect(result.reason).toBeUndefined();
  });

  it("rechaza equipos con distinta cantidad de parejas, antes de llegar a validar canchas", () => {
    const teams = [
      { teamIndex: 0, pairs: [realPair("a0", "A0x", "A0y"), realPair("a1", "A1x", "A1y")] },
      { teamIndex: 1, pairs: [realPair("b0", "B0x", "B0y")] },
    ];
    const result = evaluateDynamicLineupsEligibility({
      isTeams: true,
      teams,
      allPairs: [...teams[0].pairs, ...teams[1].pairs],
      courts: 10,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("misma cantidad de parejas");
  });

  it("rechaza jugadores repetidos entre parejas", () => {
    const teams = [
      { teamIndex: 0, pairs: [realPair("a0", "X", "Y"), realPair("a1", "Z", "W")] },
      { teamIndex: 1, pairs: [realPair("b0", "X", "Q"), realPair("b1", "R", "S")] }, // "X" repetido
    ];
    const result = evaluateDynamicLineupsEligibility({
      isTeams: true,
      teams,
      allPairs: [...teams[0].pairs, ...teams[1].pairs],
      courts: 10,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("repetidos");
  });
});
