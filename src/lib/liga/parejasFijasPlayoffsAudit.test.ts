import { isParejasFijasLegacy, isParejasFijasPlayoffs } from "./ligaModalidad";
import {
  computePlayoffsMatchPoints,
  PLAYOFFS_SCORE_FORMAT,
  type PlayoffsMatchPoints,
  type PlayoffsSetScoresPayload,
} from "./parejasFijasPlayoffsMatchScore";
import { applyPlayoffsMatchBothSides } from "./parejasFijasPlayoffsRanking";
import { emptyEquipoRankingStats } from "./equiposRanking";
import {
  parejasFijasVictoryRankingPoints,
  resolveParejasFijasPartidoTotals,
} from "./parejasFijasMatchScore";
import {
  assertPlayoffsFixtureInvariants,
  buildPlayoffsRegularFixture,
  pairKey,
} from "./parejasFijasPlayoffsFixture";
import {
  buildGranFinalCross,
  buildJornada9Crosses,
  resolvePlayoffsFinalStandings,
  seedsFromRankingOrder,
  type EquipoStandingRow,
  type PlayoffMatchResult,
} from "./parejasFijasPlayoffsBracket";

describe("routing modalidad → helper de scoring", () => {
  it("parejas_fijas usa helper legacy (3/2/0), no playoffs", () => {
    expect(isParejasFijasLegacy("parejas_fijas")).toBe(true);
    expect(isParejasFijasPlayoffs("parejas_fijas")).toBe(false);

    const totals = resolveParejasFijasPartidoTotals({
      score_pareja1: 12,
      score_pareja2: 4,
      set_scores: {
        sets: [
          { p1: 6, p2: 2, kind: "regular" },
          { p1: 6, p2: 2, kind: "regular" },
        ],
      },
    });
    expect(totals).not.toBeNull();
    expect(parejasFijasVictoryRankingPoints(totals!, true)).toBe(3);
    expect(parejasFijasVictoryRankingPoints(totals!, false)).toBe(0);
  });

  it("parejas_fijas_playoffs usa helper nuevo (diff>2 → 3/0; diff=2 → 2/1)", () => {
    expect(isParejasFijasPlayoffs("parejas_fijas_playoffs")).toBe(true);
    expect(isParejasFijasLegacy("parejas_fijas_playoffs")).toBe(false);

    const ajustada = computePlayoffsMatchPoints(4, 2, {
      format: PLAYOFFS_SCORE_FORMAT,
      wo: false,
      stb: null,
    });
    expect(ajustada.ok).toBe(true);
    if (!ajustada.ok) return;
    expect(ajustada.result.pointsP1).toBe(2);
    expect(ajustada.result.pointsP2).toBe(1);

    const holgada = computePlayoffsMatchPoints(5, 2, {
      format: PLAYOFFS_SCORE_FORMAT,
      wo: false,
      stb: null,
    });
    expect(holgada.ok).toBe(true);
    if (!holgada.ok) return;
    expect(holgada.result.pointsP1).toBe(3);
    expect(holgada.result.pointsP2).toBe(0);
  });
});

function expectPoints(
  score1: number,
  score2: number,
  payload: PlayoffsSetScoresPayload,
  p1: number,
  p2: number
) {
  const r = computePlayoffsMatchPoints(score1, score2, payload);
  expect(r).toEqual({
    ok: true,
    result: expect.objectContaining({ pointsP1: p1, pointsP2: p2 }),
  });
}

function requireResult(
  r: ReturnType<typeof computePlayoffsMatchPoints>
): PlayoffsMatchPoints {
  expect(r.ok).toBe(true);
  return (r as { ok: true; result: PlayoffsMatchPoints }).result;
}

describe("scoring playoffs casos auditoría", () => {
  const base: PlayoffsSetScoresPayload = {
    format: PLAYOFFS_SCORE_FORMAT,
    wo: false,
    stb: null,
  };

  it("5-2 → 3/0; 4-2 → 2/1; 4-3 → 2/1; 4-4 sin STB falla; STB 5-3 → 2/1; WO → 3/-1", () => {
    expectPoints(5, 2, base, 3, 0);
    expectPoints(4, 2, base, 2, 1);
    expectPoints(4, 3, base, 2, 1);
    expect(computePlayoffsMatchPoints(4, 4, base).ok).toBe(false);
    expectPoints(4, 4, { ...base, stb: { p1: 5, p2: 3 } }, 2, 1);
    expectPoints(6, 0, { ...base, wo: true }, 3, -1);
  });

  it("editar 4-3 → 5-2 reemplaza (recalc), no acumula", () => {
    const first = requireResult(computePlayoffsMatchPoints(4, 3, base));
    const a = emptyEquipoRankingStats();
    const b = emptyEquipoRankingStats();
    applyPlayoffsMatchBothSides(a, b, 4, 3, first);

    const a2 = emptyEquipoRankingStats();
    const b2 = emptyEquipoRankingStats();
    const second = requireResult(computePlayoffsMatchPoints(5, 2, base));
    applyPlayoffsMatchBothSides(a2, b2, 5, 2, second);
    expect(a2.puntos).toBe(3);
    expect(b2.puntos).toBe(0);
    expect(a2.puntos).not.toBe(a.puntos + 3);
  });

  it("invertir ganador 5-2 → 2-5 corrige puntos y PG/PP", () => {
    const second = requireResult(computePlayoffsMatchPoints(2, 5, base));
    const a = emptyEquipoRankingStats();
    const b = emptyEquipoRankingStats();
    applyPlayoffsMatchBothSides(a, b, 2, 5, second);
    expect(a.puntos).toBe(0);
    expect(b.puntos).toBe(3);
    expect(a.partidos_ganados).toBe(0);
    expect(b.partidos_ganados).toBe(1);
  });
});

describe("fixture auditoría matemática", () => {
  const TEAMS = ["A", "B", "C", "D", "E", "F", "G", "H"];

  it("28 combinaciones × exactamente 2; 14 por pareja; counts J1–J8", () => {
    const fixture = buildPlayoffsRegularFixture(TEAMS);
    assertPlayoffsFixtureInvariants(fixture, TEAMS);

    const pairCounts = new Map<string, number>();
    const byTeam = new Map<string, number>();
    for (const id of TEAMS) byTeam.set(id, 0);

    for (const j of fixture.jornadas) {
      for (const m of j.matches) {
        const k = pairKey(m.equipo1_id, m.equipo2_id);
        pairCounts.set(k, (pairCounts.get(k) ?? 0) + 1);
        byTeam.set(m.equipo1_id, (byTeam.get(m.equipo1_id) ?? 0) + 1);
        byTeam.set(m.equipo2_id, (byTeam.get(m.equipo2_id) ?? 0) + 1);
      }
    }

    expect(pairCounts.size).toBe(28);
    for (const [, c] of Array.from(pairCounts.entries())) {
      expect(c).toBe(2);
    }
    for (const id of TEAMS) {
      expect(byTeam.get(id)).toBe(14);
    }
    expect(fixture.jornadas.map((j) => j.matches.length)).toEqual([
      8, 8, 8, 4, 8, 8, 8, 4,
    ]);
  });
});

describe("ranking final escenario auditoría A–H", () => {
  function standing(
    id: string,
    puntos: number
  ): EquipoStandingRow {
    return {
      equipo_id: id,
      puntos,
      diferencia_games: 0,
      games_favor: puntos,
      partidos_ganados: 0,
      partidos_jugados: 0,
      nombre: id,
    };
  }

  it("B campeón / D subcampeón; bloques SF/CL por puntos; FINAL absoluto", () => {
    const seeds = seedsFromRankingOrder([
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
    ]);
    const j9 = buildJornada9Crosses(seeds);
    expect(j9.map((c) => [c.slot, c.equipo1_id, c.equipo2_id])).toEqual([
      ["SF1", "A", "D"],
      ["SF2", "B", "C"],
      ["CL1", "E", "H"],
      ["CL2", "F", "G"],
    ]);

    const results: PlayoffMatchResult[] = [
      {
        slot: "SF1",
        equipo1_id: "A",
        equipo2_id: "D",
        winner_id: "D",
        loser_id: "A",
      },
      {
        slot: "SF2",
        equipo1_id: "B",
        equipo2_id: "C",
        winner_id: "B",
        loser_id: "C",
      },
      {
        slot: "CL1",
        equipo1_id: "E",
        equipo2_id: "H",
        winner_id: "H",
        loser_id: "E",
      },
      {
        slot: "CL2",
        equipo1_id: "F",
        equipo2_id: "G",
        winner_id: "F",
        loser_id: "G",
      },
      {
        slot: "FINAL",
        equipo1_id: "D",
        equipo2_id: "B",
        winner_id: "B",
        loser_id: "D",
      },
    ];

    // D tiene MUCHOS más puntos que B — igual B es 1°
    const standings = [
      standing("D", 99),
      standing("B", 10),
      standing("A", 40),
      standing("C", 35),
      standing("F", 27),
      standing("H", 24),
      standing("E", 22),
      standing("G", 20),
    ];

    const order = resolvePlayoffsFinalStandings({
      seeds,
      results,
      standings,
    });

    expect(order[0]).toBe("B");
    expect(order[1]).toBe("D");
    expect([order[2], order[3]].sort()).toEqual(["A", "C"]);
    expect(order[2]).toBe("A"); // más puntos
    expect(order[3]).toBe("C");
    expect(order[4]).toBe("F");
    expect(order[5]).toBe("H");
    expect(order[6]).toBe("E");
    expect(order[7]).toBe("G");

    // Ningún total puede poner D sobre B ni A/C en 1–2 ni E/G en 5–6
    expect(order.indexOf("D")).toBe(1);
    expect(order.indexOf("A")).toBeGreaterThan(1);
    expect(order.indexOf("C")).toBeGreaterThan(1);
    expect(order.indexOf("E")).toBeGreaterThan(5);
    expect(order.indexOf("G")).toBeGreaterThan(5);

    const final = buildGranFinalCross("D", "B");
    expect(final.equipo1_id).toBe("D");
    expect(final.equipo2_id).toBe("B");
  });
});
