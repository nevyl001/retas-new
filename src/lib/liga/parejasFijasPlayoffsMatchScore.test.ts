import {
  buildPlayoffsPayloadFromDraft,
  computePlayoffsMatchPoints,
  parsePlayoffsSetScoresJson,
  PLAYOFFS_SCORE_FORMAT,
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
  };
}

describe("parejasFijasPlayoffsMatchScore (aislado de legacy)", () => {
  it("4-2 → 3/0", () => {
    const r = computePlayoffsMatchPoints(4, 2, payload({}));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.pointsP1).toBe(3);
    expect(r.result.pointsP2).toBe(0);
  });

  it("4-3 → 2/1", () => {
    const r = computePlayoffsMatchPoints(4, 3, payload({}));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.pointsP1).toBe(2);
    expect(r.result.pointsP2).toBe(1);
  });

  it("4-4 requiere STB", () => {
    const r = computePlayoffsMatchPoints(4, 4, payload({}));
    expect(r.ok).toBe(false);
  });

  it("4-4 + STB 5-3 → 2/1", () => {
    const r = computePlayoffsMatchPoints(
      4,
      4,
      payload({ stb: { p1: 5, p2: 3 } })
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.pointsP1).toBe(2);
    expect(r.result.pointsP2).toBe(1);
    expect(r.result.viaStb).toBe(true);
  });

  it("WO → 3 / -1", () => {
    const r = computePlayoffsMatchPoints(6, 0, payload({ wo: true }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.pointsP1).toBe(3);
    expect(r.result.pointsP2).toBe(-1);
  });

  it("parsePlayoffsSetScoresJson ignora payload legacy de sets", () => {
    expect(
      parsePlayoffsSetScoresJson({
        sets: [{ p1: 6, p2: 4, kind: "regular" }],
      })
    ).toBeNull();
  });

  it("guardar dos veces no duplica puntos (recalc replace)", () => {
    const draftOk = buildPlayoffsPayloadFromDraft({
      set1: { p1: "6", p2: "4" },
      set2: { p1: "6", p2: "3" },
      stb1: "",
      stb2: "",
      woWinner: null,
    });
    expect(draftOk.score1).toBe(12);
    expect(draftOk.score2).toBe(7);
    const pts = computePlayoffsMatchPoints(
      draftOk.score1,
      draftOk.score2,
      draftOk.payload
    );
    expect(pts.ok).toBe(true);
    if (!pts.ok) return;

    const a = emptyEquipoRankingStats();
    const b = emptyEquipoRankingStats();
    applyPlayoffsMatchBothSides(a, b, 12, 7, pts.result);
    const a2 = emptyEquipoRankingStats();
    const b2 = emptyEquipoRankingStats();
    applyPlayoffsMatchBothSides(a2, b2, 12, 7, pts.result);
    expect(a2.puntos).toBe(a.puntos);
    expect(b2.puntos).toBe(b.puntos);
    expect(a2.puntos).toBe(3);
    expect(b2.puntos).toBe(0);
  });

  it("Set1+Set2 empatados exige STB", () => {
    expect(() =>
      buildPlayoffsPayloadFromDraft({
        set1: { p1: "6", p2: "4" },
        set2: { p1: "4", p2: "6" },
        stb1: "",
        stb2: "",
        woWinner: null,
      })
    ).toThrow(/súper tie-break/i);

    const built = buildPlayoffsPayloadFromDraft({
      set1: { p1: "6", p2: "4" },
      set2: { p1: "4", p2: "6" },
      stb1: "5",
      stb2: "3",
      woWinner: null,
    });
    expect(built.score1).toBe(10);
    expect(built.score2).toBe(10);
    expect(built.payload.stb).toEqual({ p1: 5, p2: 3 });
    expect(built.payload.sets).toEqual([
      { p1: 6, p2: 4 },
      { p1: 4, p2: 6 },
    ]);
  });

  it("no importa parejasFijasVictoryRankingPoints", () => {
    // Guardrail de aislamiento: este módulo no debe depender del helper legacy.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "parejasFijasPlayoffsMatchScore.ts"),
      "utf8"
    ) as string;
    expect(src).not.toMatch(/parejasFijasMatchScore/);
    expect(src).not.toMatch(/parejasFijasVictoryRankingPoints/);
  });
});
