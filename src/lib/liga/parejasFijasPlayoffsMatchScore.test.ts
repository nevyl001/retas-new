import {
  buildPlayoffsPayloadFromDraft,
  computePlayoffsMatchFromSetInputs,
  computePlayoffsMatchPoints,
  needsPlayoffsStbDraft,
  parsePlayoffsSetScoresJson,
  PLAYOFFS_SCORE_FORMAT,
  playoffsSetsFromDraft,
  previewPlayoffsPointsFromDraft,
  type PlayoffsSetScoresPayload,
} from "./parejasFijasPlayoffsMatchScore";
import { applyPlayoffsMatchBothSides } from "./parejasFijasPlayoffsRanking";
import { emptyEquipoRankingStats } from "./equiposRanking";

function payload(
  partial: Partial<PlayoffsSetScoresPayload> & { wo?: boolean }
): PlayoffsSetScoresPayload {
  return {
    format: PLAYOFFS_SCORE_FORMAT,
    wo: partial.wo ?? false,
    stb: partial.stb ?? null,
    sets: partial.sets,
  };
}

describe("parejasFijasPlayoffsMatchScore — sets first (no games decide winner)", () => {
  it("Test 1 — Cerrada: 6-5 / 6-5 → sets 2-0, games 12-10, diff 2, 2/1", () => {
    const r = computePlayoffsMatchFromSetInputs({
      set1P1: 6,
      set1P2: 5,
      set2P1: 6,
      set2P2: 5,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.setsWonP1).toBe(2);
    expect(r.result.setsWonP2).toBe(0);
    expect(r.gamesTotalP1).toBe(12);
    expect(r.gamesTotalP2).toBe(10);
    expect(r.result.gameDiff).toBe(2);
    expect(r.result.resultType).toBe("CERRADA");
    expect(r.result.pointsP1).toBe(2);
    expect(r.result.pointsP2).toBe(1);
  });

  it("Test 2 — Holgada: 6-4 / 6-4 → sets 2-0, games 12-8, diff 4, 3/0", () => {
    const r = computePlayoffsMatchFromSetInputs({
      set1P1: 6,
      set1P2: 4,
      set2P1: 6,
      set2P2: 4,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.setsWonP1).toBe(2);
    expect(r.result.resultType).toBe("HOLGADA");
    expect(r.result.gameDiff).toBe(4);
    expect(r.result.pointsP1).toBe(3);
    expect(r.result.pointsP2).toBe(0);
  });

  it("Test 3 — Set corto: 4-3 / 5-4 → cerrada 2/1", () => {
    const r = computePlayoffsMatchFromSetInputs({
      set1P1: 4,
      set1P2: 3,
      set2P1: 5,
      set2P2: 4,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.gamesTotalP1).toBe(9);
    expect(r.gamesTotalP2).toBe(7);
    expect(r.result.gameDiff).toBe(2);
    expect(r.result.resultType).toBe("CERRADA");
    expect(r.result.pointsP1).toBe(2);
    expect(r.result.pointsP2).toBe(1);
  });

  it("Test 4 — 1-1 manda a STB aunque games 11-6", () => {
    const r = computePlayoffsMatchFromSetInputs({
      set1P1: 6,
      set1P2: 0,
      set2P1: 5,
      set2P2: 6,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/1-1|súper tie-break/i);
  });

  it("Test 5 — STB 5-3 → siempre 2/1", () => {
    const r = computePlayoffsMatchFromSetInputs({
      set1P1: 6,
      set1P2: 0,
      set2P1: 5,
      set2P2: 6,
      stbP1: 5,
      stbP2: 3,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.viaStb).toBe(true);
    expect(r.result.resultType).toBe("SUPER_TIE_BREAK");
    expect(r.result.pointsP1).toBe(2);
    expect(r.result.pointsP2).toBe(1);
  });

  it("Test 5b — gana STB quien tenía menos games", () => {
    const r = computePlayoffsMatchFromSetInputs({
      set1P1: 6,
      set1P2: 0,
      set2P1: 1,
      set2P2: 6,
      stbP1: 3,
      stbP2: 5,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.p1Won).toBe(false);
    expect(r.result.pointsP1).toBe(1);
    expect(r.result.pointsP2).toBe(2);
  });

  it("Test 6 — WO → 3 / -1", () => {
    const r = computePlayoffsMatchPoints(6, 0, payload({ wo: true }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.resultType).toBe("WO");
    expect(r.result.pointsP1).toBe(3);
    expect(r.result.pointsP2).toBe(-1);
  });

  it("NO decide por games: 6-0 + 0-5 → sets 1-1 → requiere STB (antes era 6-5→2/1)", () => {
    const r = computePlayoffsMatchFromSetInputs({
      set1P1: 6,
      set1P2: 0,
      set2P1: 0,
      set2P2: 5,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/1-1|súper tie-break/i);
  });

  it("empate en games totales con 2-0 sets NO exige STB", () => {
    // Imposible en sets válidos con 2-0 y games iguales; 2-0 siempre diff>=2.
    // Caso inverso: games iguales vía 1-1 sets (6-4 + 2-4 = 8-8) sí STB por sets.
    const r = computePlayoffsMatchFromSetInputs({
      set1P1: 6,
      set1P2: 4,
      set2P1: 2,
      set2P2: 4,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/1-1/);
  });

  it("diff exactamente 2 es cerrada (no holgada): 6-5 / 6-5", () => {
    const r = computePlayoffsMatchFromSetInputs({
      set1P1: 6,
      set1P2: 5,
      set2P1: 6,
      set2P2: 5,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.resultType).toBe("CERRADA");
    expect(r.result.pointsP1).toBe(2);
  });

  it("recalcula desde sets aunque el cliente mande totales malos", () => {
    const r = computePlayoffsMatchPoints(
      99,
      99,
      payload({
        sets: [
          { p1: 6, p2: 4 },
          { p1: 6, p2: 4 },
        ],
      })
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.pointsP1).toBe(3);
    expect(r.result.pointsP2).toBe(0);
  });

  describe("sets empatados por tiempo (Tests A–E)", () => {
    it("Test A — 6-4 / 5-5 → sets 1-0, games 11-9, diff 2, CERRADA 2/1, sin STB", () => {
      const r = computePlayoffsMatchFromSetInputs({
        set1P1: 6,
        set1P2: 4,
        set2P1: 5,
        set2P2: 5,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.result.setsWonP1).toBe(1);
      expect(r.result.setsWonP2).toBe(0);
      expect(r.gamesTotalP1).toBe(11);
      expect(r.gamesTotalP2).toBe(9);
      expect(r.result.gameDiff).toBe(2);
      expect(r.result.requiresSuperTieBreak).toBe(false);
      expect(r.result.viaStb).toBe(false);
      expect(r.result.p1Won).toBe(true);
      expect(r.result.resultType).toBe("CERRADA");
      expect(r.result.pointsP1).toBe(2);
      expect(r.result.pointsP2).toBe(1);
    });

    it("Test B — 6-2 / 5-5 → games 11-7, diff 4, HOLGADA 3/0", () => {
      const r = computePlayoffsMatchFromSetInputs({
        set1P1: 6,
        set1P2: 2,
        set2P1: 5,
        set2P2: 5,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.result.setsWonP1).toBe(1);
      expect(r.result.setsWonP2).toBe(0);
      expect(r.gamesTotalP1).toBe(11);
      expect(r.gamesTotalP2).toBe(7);
      expect(r.result.gameDiff).toBe(4);
      expect(r.result.resultType).toBe("HOLGADA");
      expect(r.result.pointsP1).toBe(3);
      expect(r.result.pointsP2).toBe(0);
    });

    it("Test C — 5-5 / 4-3 → sets 1-0, games 9-8, CERRADA 2/1", () => {
      const r = computePlayoffsMatchFromSetInputs({
        set1P1: 5,
        set1P2: 5,
        set2P1: 4,
        set2P2: 3,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.result.setsWonP1).toBe(1);
      expect(r.result.setsWonP2).toBe(0);
      expect(r.gamesTotalP1).toBe(9);
      expect(r.gamesTotalP2).toBe(8);
      expect(r.result.gameDiff).toBe(1);
      expect(r.result.resultType).toBe("CERRADA");
      expect(r.result.pointsP1).toBe(2);
      expect(r.result.pointsP2).toBe(1);
    });

    it("Test D — 5-5 / 4-4 → sets 0-0 → requiere STB", () => {
      const r = computePlayoffsMatchFromSetInputs({
        set1P1: 5,
        set1P2: 5,
        set2P1: 4,
        set2P2: 4,
      });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error).toMatch(/súper tie-break/i);
    });

    it("Test E — 6-0 / 4-6 → sets 1-1, games 10-6 → requiere STB (no 3/0)", () => {
      const r = computePlayoffsMatchFromSetInputs({
        set1P1: 6,
        set1P2: 0,
        set2P1: 4,
        set2P2: 6,
      });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error).toMatch(/1-1|súper tie-break/i);
    });

    it("GF/GC incluyen games del set empatado (6-4 / 5-5 → A +11/+9)", () => {
      const r = computePlayoffsMatchFromSetInputs({
        set1P1: 6,
        set1P2: 4,
        set2P1: 5,
        set2P2: 5,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const a = emptyEquipoRankingStats();
      const b = emptyEquipoRankingStats();
      applyPlayoffsMatchBothSides(
        a,
        b,
        r.gamesTotalP1,
        r.gamesTotalP2,
        r.result
      );
      expect(a.games_favor).toBe(11);
      expect(a.games_contra).toBe(9);
      expect(b.games_favor).toBe(9);
      expect(b.games_contra).toBe(11);
      expect(a.puntos).toBe(2);
      expect(b.puntos).toBe(1);
    });
  });

  it("STB no permitido si ya hay 2-0", () => {
    const r = computePlayoffsMatchPoints(12, 8, payload({
      sets: [
        { p1: 6, p2: 4 },
        { p1: 6, p2: 4 },
      ],
      stb: { p1: 5, p2: 3 },
    }));
    expect(r.ok).toBe(false);
  });

  it("preview + needsStb usan sets 1-1 (no empate de games)", () => {
    const draft = {
      set1: { p1: "6", p2: "0" },
      set2: { p1: "5", p2: "6" },
      stb1: "",
      stb2: "",
      woWinner: null as null,
    };
    expect(playoffsSetsFromDraft(draft)).toEqual({ setsP1: 1, setsP2: 1 });
    expect(needsPlayoffsStbDraft(draft)).toBe(true);
    const preview = previewPlayoffsPointsFromDraft(draft);
    expect(preview.kind).toBe("needs_stb");
  });

  it("preview cerrada 6-5/6-5", () => {
    const preview = previewPlayoffsPointsFromDraft({
      set1: { p1: "6", p2: "5" },
      set2: { p1: "6", p2: "5" },
      stb1: "",
      stb2: "",
      woWinner: null,
    });
    expect(preview.kind).toBe("cerrada");
  });

  it("edición 6-5/6-5 → 6-2/6-2 reemplaza (2/1 → 3/0), no acumula", () => {
    const first = buildPlayoffsPayloadFromDraft({
      set1: { p1: "6", p2: "5" },
      set2: { p1: "6", p2: "5" },
      stb1: "",
      stb2: "",
      woWinner: null,
    });
    const pts1 = computePlayoffsMatchPoints(
      first.score1,
      first.score2,
      first.payload
    );
    expect(pts1.ok).toBe(true);
    if (!pts1.ok) return;
    expect(pts1.result.pointsP1).toBe(2);

    const corrected = buildPlayoffsPayloadFromDraft({
      set1: { p1: "6", p2: "2" },
      set2: { p1: "6", p2: "2" },
      stb1: "",
      stb2: "",
      woWinner: null,
    });
    const pts2 = computePlayoffsMatchPoints(
      corrected.score1,
      corrected.score2,
      corrected.payload
    );
    expect(pts2.ok).toBe(true);
    if (!pts2.ok) return;

    const a = emptyEquipoRankingStats();
    const b = emptyEquipoRankingStats();
    applyPlayoffsMatchBothSides(
      a,
      b,
      corrected.score1,
      corrected.score2,
      pts2.result
    );
    expect(a.puntos).toBe(3);
    expect(b.puntos).toBe(0);
    expect(a.puntos).not.toBe(2 + 3);
  });

  it("cambio 2-0 → 1-1 exige STB (no cierra sin STB)", () => {
    expect(() =>
      buildPlayoffsPayloadFromDraft({
        set1: { p1: "6", p2: "4" },
        set2: { p1: "4", p2: "6" },
        stb1: "",
        stb2: "",
        woWinner: null,
      })
    ).toThrow(/1-1|súper tie-break/i);
  });

  it("cambio 1-1+STB → 2-0 limpia STB del payload", () => {
    const withStb = buildPlayoffsPayloadFromDraft({
      set1: { p1: "6", p2: "4" },
      set2: { p1: "4", p2: "6" },
      stb1: "5",
      stb2: "3",
      woWinner: null,
    });
    expect(withStb.payload.stb).toEqual({ p1: 5, p2: 3 });

    const direct = buildPlayoffsPayloadFromDraft({
      set1: { p1: "6", p2: "4" },
      set2: { p1: "6", p2: "2" },
      stb1: "5",
      stb2: "3",
      woWinner: null,
    });
    expect(direct.payload.stb).toBeNull();
    const pts = computePlayoffsMatchPoints(
      direct.score1,
      direct.score2,
      direct.payload
    );
    expect(pts.ok).toBe(true);
    if (!pts.ok) return;
    expect(pts.result.resultType).toBe("HOLGADA");
    expect(pts.result.viaStb).toBe(false);
  });

  it("parsePlayoffsSetScoresJson ignora payload legacy de sets", () => {
    expect(
      parsePlayoffsSetScoresJson({
        sets: [{ p1: 6, p2: 4, kind: "regular" }],
      })
    ).toBeNull();
  });

  it("no importa parejasFijasVictoryRankingPoints", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "parejasFijasPlayoffsMatchScore.ts"),
      "utf8"
    ) as string;
    expect(src).not.toMatch(/parejasFijasMatchScore/);
    expect(src).not.toMatch(/parejasFijasVictoryRankingPoints/);
  });
});
