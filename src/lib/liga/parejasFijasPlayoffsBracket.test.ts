import {
  buildGranFinalCross,
  buildPlayoffCrosses,
  mergeBracketSlots,
  PLAYOFFS_SEEDS_BYE_KEY,
  resolvePlayoffsFinalStandings,
  seedsFromRankingOrder,
  type EquipoStandingRow,
  type PlayoffMatchResult,
  type PlayoffSeeds,
} from "./parejasFijasPlayoffsBracket";

function standing(
  id: string,
  puntos: number,
  extras: Partial<EquipoStandingRow> = {}
): EquipoStandingRow {
  return {
    equipo_id: id,
    puntos,
    diferencia_games: extras.diferencia_games ?? 0,
    games_favor: extras.games_favor ?? 0,
    partidos_ganados: extras.partidos_ganados ?? 0,
    partidos_jugados: extras.partidos_jugados ?? 0,
    nombre: id,
  };
}

function letters(n: number): string[] {
  return Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
}

describe("parejasFijasPlayoffsBracket (N variable)", () => {
  it("N=8: SF 1v4/2v3, CL 5v8/6v7", () => {
    const seeds = seedsFromRankingOrder(letters(8));
    const { crosses, byeSeed } = buildPlayoffCrosses(seeds);
    expect(byeSeed).toBeNull();
    expect(crosses.map((c) => [c.slot, c.equipo1_id, c.equipo2_id])).toEqual([
      ["SF1", "A", "D"],
      ["SF2", "B", "C"],
      ["CL1", "E", "H"],
      ["CL2", "F", "G"],
    ]);
  });

  it("N=10: CL 5v10, 6v9, 7v8", () => {
    const seeds = seedsFromRankingOrder(letters(10));
    const { crosses, byeSeed } = buildPlayoffCrosses(seeds);
    expect(byeSeed).toBeNull();
    expect(
      crosses.filter((c) => c.slot.startsWith("CL")).map((c) => [
        c.slot,
        c.seedHome,
        c.seedAway,
      ])
    ).toEqual([
      ["CL1", 5, 10],
      ["CL2", 6, 9],
      ["CL3", 7, 8],
    ]);
  });

  it("N=12: CL 5v12 … 8v9", () => {
    const seeds = seedsFromRankingOrder(letters(12));
    const { crosses } = buildPlayoffCrosses(seeds);
    expect(
      crosses.filter((c) => c.slot.startsWith("CL")).map((c) => [
        c.slot,
        c.seedHome,
        c.seedAway,
      ])
    ).toEqual([
      ["CL1", 5, 12],
      ["CL2", 6, 11],
      ["CL3", 7, 10],
      ["CL4", 8, 9],
    ]);
  });

  it("N=15: CL 5v15…9v11 + BYE seed 10", () => {
    const seeds = seedsFromRankingOrder(letters(15));
    const { crosses, byeSeed, byeEquipoId } = buildPlayoffCrosses(seeds);
    expect(byeSeed).toBe(10);
    expect(byeEquipoId).toBe("J");
    expect(seeds[PLAYOFFS_SEEDS_BYE_KEY]).toBe("J");
    expect(
      crosses.filter((c) => c.slot.startsWith("CL")).map((c) => [
        c.slot,
        c.seedHome,
        c.seedAway,
      ])
    ).toEqual([
      ["CL1", 5, 15],
      ["CL2", 6, 14],
      ["CL3", 7, 13],
      ["CL4", 8, 12],
      ["CL5", 9, 11],
    ]);
  });

  it("Gran Final solo ganadores SF", () => {
    const final = buildGranFinalCross("A", "C");
    expect(final.slot).toBe("FINAL");
    expect(final.equipo1_id).toBe("A");
    expect(final.equipo2_id).toBe("C");
  });

  it("idempotencia mergeBracketSlots", () => {
    const { crosses } = buildPlayoffCrosses(seedsFromRankingOrder(letters(8)));
    expect(mergeBracketSlots(crosses, crosses)).toHaveLength(4);
  });

  it("N=8 clasificación final: FINAL absoluto + bloques por puntos", () => {
    const seeds: PlayoffSeeds = seedsFromRankingOrder(letters(8));
    const results: PlayoffMatchResult[] = [
      {
        slot: "SF1",
        equipo1_id: "A",
        equipo2_id: "D",
        winner_id: "A",
        loser_id: "D",
      },
      {
        slot: "SF2",
        equipo1_id: "B",
        equipo2_id: "C",
        winner_id: "C",
        loser_id: "B",
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
        equipo1_id: "A",
        equipo2_id: "C",
        winner_id: "C",
        loser_id: "A",
      },
    ];
    const standings = [
      standing("A", 40),
      standing("C", 30),
      standing("D", 31),
      standing("B", 29),
      standing("F", 27),
      standing("H", 24),
      standing("E", 22),
      standing("G", 20),
    ];
    const order = resolvePlayoffsFinalStandings({ seeds, results, standings });
    expect(order).toEqual(["C", "A", "D", "B", "F", "H", "E", "G"]);
  });

  it("N=15: BYE ocupa slot intermedio 10° sin puntos ficticios", () => {
    const ids = letters(15);
    const seeds = seedsFromRankingOrder(ids);
    const results: PlayoffMatchResult[] = [
      {
        slot: "SF1",
        equipo1_id: "A",
        equipo2_id: "D",
        winner_id: "A",
        loser_id: "D",
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
        equipo2_id: "O",
        winner_id: "E",
        loser_id: "O",
      },
      {
        slot: "CL2",
        equipo1_id: "F",
        equipo2_id: "N",
        winner_id: "F",
        loser_id: "N",
      },
      {
        slot: "CL3",
        equipo1_id: "G",
        equipo2_id: "M",
        winner_id: "G",
        loser_id: "M",
      },
      {
        slot: "CL4",
        equipo1_id: "H",
        equipo2_id: "L",
        winner_id: "H",
        loser_id: "L",
      },
      {
        slot: "CL5",
        equipo1_id: "I",
        equipo2_id: "K",
        winner_id: "I",
        loser_id: "K",
      },
      {
        slot: "FINAL",
        equipo1_id: "A",
        equipo2_id: "B",
        winner_id: "A",
        loser_id: "B",
      },
    ];
    const standings = ids.map((id, idx) => standing(id, 100 - idx));
    const order = resolvePlayoffsFinalStandings({ seeds, results, standings });
    expect(order[0]).toBe("A");
    expect(order[1]).toBe("B");
    expect(order[2]).toBe("C");
    expect(order[3]).toBe("D");
    expect(order[9]).toBe("J"); // BYE = 10°
    expect(order.slice(4, 9)).toEqual(["E", "F", "G", "H", "I"]);
    expect(order.slice(10)).toEqual(["K", "L", "M", "N", "O"]);
  });
});
