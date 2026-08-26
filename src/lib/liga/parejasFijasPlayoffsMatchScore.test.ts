import {
  buildPlayoffsPayloadFromDraft,
  computePlayoffsMatchFromSetInputs,
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
    sets: partial.sets,
  };
}

describe("parejasFijasPlayoffsMatchScore — games totales (no sets ganados)", () => {
  it("Set1 6-4 + Set2 3-2 → Total 9-6 → 3/0", () => {
    const r = computePlayoffsMatchFromSetInputs({
      set1P1: 6,
      set1P2: 4,
      set2P1: 3,
      set2P2: 2,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.gamesTotalP1).toBe(9);
    expect(r.gamesTotalP2).toBe(6);
    expect(r.result.pointsP1).toBe(3);
    expect(r.result.pointsP2).toBe(0);
  });

  it("Set1 6-4 + Set2 2-3 → Total 8-7 → 2/1", () => {
    const r = computePlayoffsMatchFromSetInputs({
      set1P1: 6,
      set1P2: 4,
      set2P1: 2,
      set2P2: 3,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.gamesTotalP1).toBe(8);
    expect(r.gamesTotalP2).toBe(7);
    expect(r.result.pointsP1).toBe(2);
    expect(r.result.pointsP2).toBe(1);
  });

  it("Set1 6-4 + Set2 2-4 → Total 8-8 → requiere STB", () => {
    const r = computePlayoffsMatchFromSetInputs({
      set1P1: 6,
      set1P2: 4,
      set2P1: 2,
      set2P2: 4,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/súper tie-break/i);
  });

  it("8-8 + STB 5-3 → 2/1", () => {
    const r = computePlayoffsMatchFromSetInputs({
      set1P1: 6,
      set1P2: 4,
      set2P1: 2,
      set2P2: 4,
      stbP1: 5,
      stbP2: 3,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.gamesTotalP1).toBe(8);
    expect(r.gamesTotalP2).toBe(8);
    expect(r.result.pointsP1).toBe(2);
    expect(r.result.pointsP2).toBe(1);
    expect(r.result.viaStb).toBe(true);
  });

  it("Set1 4-2 + Set2 0-0 → Total 4-2 → 2/1 (diff 2 no es holgada)", () => {
    const r = computePlayoffsMatchFromSetInputs({
      set1P1: 4,
      set1P2: 2,
      set2P1: 0,
      set2P2: 0,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.gamesTotalP1).toBe(4);
    expect(r.gamesTotalP2).toBe(2);
    expect(r.result.pointsP1).toBe(2);
    expect(r.result.pointsP2).toBe(1);
  });

  it("Total 10-8 (diff 2) → victoria ajustada 2/1, no holgada", () => {
    const r = computePlayoffsMatchFromSetInputs({
      set1P1: 4,
      set1P2: 6,
      set2P1: 6,
      set2P2: 2,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.gamesTotalP1).toBe(10);
    expect(r.gamesTotalP2).toBe(8);
    expect(r.result.pointsP1).toBe(2);
    expect(r.result.pointsP2).toBe(1);
  });

  it("Caso A: 6-3 + 4-2 → 10-5 → 3/0 (diff 5 > 2)", () => {
    const r = computePlayoffsMatchFromSetInputs({
      set1P1: 6,
      set1P2: 3,
      set2P1: 4,
      set2P2: 2,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.gamesTotalP1).toBe(10);
    expect(r.gamesTotalP2).toBe(5);
    expect(r.result.pointsP1).toBe(3);
    expect(r.result.pointsP2).toBe(0);
  });

  it("STB 5-0 sigue siendo 2/1 (diff STB no importa)", () => {
    const r = computePlayoffsMatchFromSetInputs({
      set1P1: 6,
      set1P2: 4,
      set2P1: 2,
      set2P2: 4,
      stbP1: 5,
      stbP2: 0,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.pointsP1).toBe(2);
    expect(r.result.pointsP2).toBe(1);
  });

  it("no usa sets ganados: Set1 6-0 + Set2 0-5 → Total 6-5 → 2/1 (no 1-1 sets)", () => {
    const r = computePlayoffsMatchFromSetInputs({
      set1P1: 6,
      set1P2: 0,
      set2P1: 0,
      set2P2: 5,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.gamesTotalP1).toBe(6);
    expect(r.gamesTotalP2).toBe(5);
    expect(r.result.pointsP1).toBe(2);
    expect(r.result.pointsP2).toBe(1);
    expect(r.result.viaStb).toBe(false);
  });

  it("recalcula totales desde sets aunque el cliente mande totales malos", () => {
    const r = computePlayoffsMatchPoints(
      99,
      99,
      payload({
        sets: [
          { p1: 6, p2: 4 },
          { p1: 3, p2: 2 },
        ],
      })
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.pointsP1).toBe(3);
    expect(r.result.pointsP2).toBe(0);
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
      set2: { p1: "3", p2: "2" },
      stb1: "",
      stb2: "",
      woWinner: null,
    });
    expect(draftOk.score1).toBe(9);
    expect(draftOk.score2).toBe(6);
    const pts = computePlayoffsMatchPoints(
      draftOk.score1,
      draftOk.score2,
      draftOk.payload
    );
    expect(pts.ok).toBe(true);
    if (!pts.ok) return;

    const a = emptyEquipoRankingStats();
    const b = emptyEquipoRankingStats();
    applyPlayoffsMatchBothSides(a, b, 9, 6, pts.result);
    const a2 = emptyEquipoRankingStats();
    const b2 = emptyEquipoRankingStats();
    applyPlayoffsMatchBothSides(a2, b2, 9, 6, pts.result);
    expect(a2.puntos).toBe(a.puntos);
    expect(b2.puntos).toBe(b.puntos);
    expect(a2.puntos).toBe(3);
    expect(b2.puntos).toBe(0);
  });

  it("edición de marcador sin doble acumulación (replace stats)", () => {
    const first = buildPlayoffsPayloadFromDraft({
      set1: { p1: "4", p2: "2" },
      set2: { p1: "0", p2: "0" },
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

    const corrected = buildPlayoffsPayloadFromDraft({
      set1: { p1: "6", p2: "4" },
      set2: { p1: "2", p2: "3" },
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

    // El ranking playoffs se recalcula desde cero por partidos; simular replace.
    const a = emptyEquipoRankingStats();
    const b = emptyEquipoRankingStats();
    applyPlayoffsMatchBothSides(
      a,
      b,
      corrected.score1,
      corrected.score2,
      pts2.result
    );
    expect(a.puntos).toBe(2);
    expect(b.puntos).toBe(1);
    expect(a.puntos).not.toBe(3 + 2);
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
