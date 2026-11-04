import { buildPlayoffCrosses, seedsFromRankingOrder } from "./parejasFijasPlayoffsBracket";
import {
  planGranFinalSync,
  planThirdPlaceSync,
  resolvePlayoffsMatchWinnerEquipoId,
  resolvePlayoffsSemifinalWinners,
  type ExistingFinalSnapshot,
  type PlayoffsSemifinalRowInput,
} from "./parejasFijasPlayoffsGranFinal";
import { PLAYOFFS_SCORE_FORMAT } from "./parejasFijasPlayoffsMatchScore";

/** IDs oficiales Padelito Warehouse T1 (producción). */
const PADELITO = {
  cuadra: "224e1237-74a9-4da9-8477-8a263d125c96",
  arturo: "f5883491-f0bb-4e9a-a374-b4c439b3197c",
  eddie: "eb451406-f7d1-46f6-9ce9-7e66b1563035",
  kevin: "0b866493-fa0c-4b21-a462-861050c3947a",
} as const;

function sfRow(
  slot: "SF1" | "SF2",
  eq1: string,
  eq2: string,
  score1: number,
  score2: number,
  setScores: unknown,
  estado = "completed"
): PlayoffsSemifinalRowInput {
  return {
    bracket_slot: slot,
    estado,
    pareja1_equipo_id: eq1,
    pareja2_equipo_id: eq2,
    score_pareja1: score1,
    score_pareja2: score2,
    set_scores: setScores,
  };
}

describe("playoffs Gran Final — sembrado y avance", () => {
  it("A/B — SF1 = 1º vs 4º; SF2 = 2º vs 3º", () => {
    const seeds = seedsFromRankingOrder([
      PADELITO.cuadra,
      PADELITO.arturo,
      PADELITO.eddie,
      PADELITO.kevin,
    ]);
    const { crosses } = buildPlayoffCrosses(seeds);
    const sf1 = crosses.find((c) => c.slot === "SF1")!;
    const sf2 = crosses.find((c) => c.slot === "SF2")!;
    expect(sf1.equipo1_id).toBe(PADELITO.cuadra);
    expect(sf1.equipo2_id).toBe(PADELITO.kevin);
    expect(sf2.equipo1_id).toBe(PADELITO.arturo);
    expect(sf2.equipo2_id).toBe(PADELITO.eddie);
  });

  it("C — el peor clasificado avanza si gana la semifinal", () => {
    const rows = [
      sfRow(
        "SF1",
        PADELITO.cuadra,
        PADELITO.kevin,
        12,
        7,
        {
          format: PLAYOFFS_SCORE_FORMAT,
          sets: [
            { p1: 6, p2: 4 },
            { p1: 6, p2: 3 },
          ],
          stb: null,
          wo: false,
        }
      ),
      sfRow(
        "SF2",
        PADELITO.arturo,
        PADELITO.eddie,
        10,
        9,
        {
          format: PLAYOFFS_SCORE_FORMAT,
          sets: [
            { p1: 4, p2: 6 },
            { p1: 6, p2: 3 },
          ],
          stb: { p1: 4, p2: 10 },
          wo: false,
        }
      ),
    ];
    const resolved = resolvePlayoffsSemifinalWinners(rows);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.winners[0]!.winnerEquipoId).toBe(PADELITO.cuadra);
    expect(resolved.winners[1]!.winnerEquipoId).toBe(PADELITO.eddie);
    expect(resolved.winners[1]!.loserEquipoId).toBe(PADELITO.arturo);
  });

  it("D — Padelito: 1-1 + STB 4-10 gana el segundo equipo (Eddie)", () => {
    const r = resolvePlayoffsMatchWinnerEquipoId(
      PADELITO.arturo,
      PADELITO.eddie,
      10,
      9,
      {
        format: PLAYOFFS_SCORE_FORMAT,
        sets: [
          { p1: 4, p2: 6 },
          { p1: 6, p2: 3 },
        ],
        stb: { p1: 4, p2: 10 },
        wo: false,
      }
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.viaStb).toBe(true);
    expect(r.winnerEquipoId).toBe(PADELITO.eddie);
    expect(r.loserEquipoId).toBe(PADELITO.arturo);
  });

  it("E — 1-1 con set completo decisivo gana quien cierra el set 3", () => {
    const r = resolvePlayoffsMatchWinnerEquipoId(
      PADELITO.arturo,
      PADELITO.eddie,
      16,
      15,
      {
        format: PLAYOFFS_SCORE_FORMAT,
        sets: [
          { p1: 4, p2: 6 },
          { p1: 6, p2: 3 },
          { p1: 6, p2: 6 },
        ],
        stb: null,
        wo: false,
      }
    );
    // set3 empatado inválido
    expect(r.ok).toBe(false);

    const ok = resolvePlayoffsMatchWinnerEquipoId(
      PADELITO.arturo,
      PADELITO.eddie,
      16,
      14,
      {
        format: PLAYOFFS_SCORE_FORMAT,
        sets: [
          { p1: 4, p2: 6 },
          { p1: 6, p2: 3 },
          { p1: 6, p2: 5 },
        ],
        stb: null,
        wo: false,
      }
    );
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.winnerEquipoId).toBe(PADELITO.arturo);
  });

  it("F — resultado incompleto (1-1 sin desempate) no inventa ganador", () => {
    const r = resolvePlayoffsMatchWinnerEquipoId(
      PADELITO.arturo,
      PADELITO.eddie,
      10,
      9,
      {
        format: PLAYOFFS_SCORE_FORMAT,
        sets: [
          { p1: 4, p2: 6 },
          { p1: 6, p2: 3 },
        ],
        stb: null,
        wo: false,
      }
    );
    expect(r.ok).toBe(false);

    const semis = resolvePlayoffsSemifinalWinners([
      sfRow(
        "SF1",
        PADELITO.cuadra,
        PADELITO.kevin,
        12,
        7,
        {
          format: PLAYOFFS_SCORE_FORMAT,
          sets: [
            { p1: 6, p2: 4 },
            { p1: 6, p2: 3 },
          ],
          stb: null,
          wo: false,
        }
      ),
      sfRow(
        "SF2",
        PADELITO.arturo,
        PADELITO.eddie,
        10,
        9,
        {
          format: PLAYOFFS_SCORE_FORMAT,
          sets: [
            { p1: 4, p2: 6 },
            { p1: 6, p2: 3 },
          ],
          stb: null,
          wo: false,
        }
      ),
    ]);
    expect(semis.ok).toBe(false);
  });

  it("G — edición posterior de SF actualiza FINAL sin marcador", () => {
    const winners = resolvePlayoffsSemifinalWinners([
      sfRow(
        "SF1",
        PADELITO.cuadra,
        PADELITO.kevin,
        12,
        7,
        {
          format: PLAYOFFS_SCORE_FORMAT,
          sets: [
            { p1: 6, p2: 4 },
            { p1: 6, p2: 3 },
          ],
          stb: null,
          wo: false,
        }
      ),
      sfRow(
        "SF2",
        PADELITO.arturo,
        PADELITO.eddie,
        10,
        9,
        {
          format: PLAYOFFS_SCORE_FORMAT,
          sets: [
            { p1: 4, p2: 6 },
            { p1: 6, p2: 3 },
          ],
          stb: { p1: 4, p2: 10 },
          wo: false,
        }
      ),
    ]);
    expect(winners.ok).toBe(true);
    if (!winners.ok) return;

    const wrongFinal: ExistingFinalSnapshot = {
      id: "a5806e1d-81ff-402a-9406-706be98b5f98",
      equipo1_id: PADELITO.arturo,
      equipo2_id: PADELITO.cuadra,
      estado: "upcoming",
      score_pareja1: null,
      score_pareja2: null,
      set_scores: null,
    };

    const plan = planGranFinalSync(winners.winners, wrongFinal);
    expect(plan.action).toBe("update_unscored");
    if (plan.action !== "update_unscored") return;
    expect(new Set([plan.equipo1_id, plan.equipo2_id])).toEqual(
      new Set([PADELITO.cuadra, PADELITO.eddie])
    );
    expect(plan.previousEquipo1_id).toBe(PADELITO.arturo);
  });

  it("G2 — FINAL con marcador no se sobrescribe ante corrección de SF", () => {
    const winners = resolvePlayoffsSemifinalWinners([
      sfRow(
        "SF1",
        PADELITO.cuadra,
        PADELITO.kevin,
        12,
        7,
        {
          format: PLAYOFFS_SCORE_FORMAT,
          sets: [
            { p1: 6, p2: 4 },
            { p1: 6, p2: 3 },
          ],
          stb: null,
          wo: false,
        }
      ),
      sfRow(
        "SF2",
        PADELITO.arturo,
        PADELITO.eddie,
        10,
        9,
        {
          format: PLAYOFFS_SCORE_FORMAT,
          sets: [
            { p1: 4, p2: 6 },
            { p1: 6, p2: 3 },
          ],
          stb: { p1: 4, p2: 10 },
          wo: false,
        }
      ),
    ]);
    expect(winners.ok).toBe(true);
    if (!winners.ok) return;

    const scored: ExistingFinalSnapshot = {
      id: "final-scored",
      equipo1_id: PADELITO.arturo,
      equipo2_id: PADELITO.cuadra,
      estado: "completed",
      score_pareja1: 12,
      score_pareja2: 6,
      set_scores: {
        format: PLAYOFFS_SCORE_FORMAT,
        sets: [
          { p1: 6, p2: 3 },
          { p1: 6, p2: 3 },
        ],
        stb: null,
        wo: false,
      },
    };
    const plan = planGranFinalSync(winners.winners, scored);
    expect(plan.action).toBe("blocked_scored_mismatch");
  });

  it("H — repetición: plan es idempotente si FINAL ya es correcta", () => {
    const winners = resolvePlayoffsSemifinalWinners([
      sfRow(
        "SF1",
        PADELITO.arturo,
        PADELITO.eddie,
        10,
        9,
        {
          format: PLAYOFFS_SCORE_FORMAT,
          sets: [
            { p1: 4, p2: 6 },
            { p1: 6, p2: 3 },
          ],
          stb: { p1: 4, p2: 10 },
          wo: false,
        }
      ),
      sfRow(
        "SF2",
        PADELITO.cuadra,
        PADELITO.kevin,
        12,
        7,
        {
          format: PLAYOFFS_SCORE_FORMAT,
          sets: [
            { p1: 6, p2: 4 },
            { p1: 6, p2: 3 },
          ],
          stb: null,
          wo: false,
        }
      ),
    ]);
    expect(winners.ok).toBe(true);
    if (!winners.ok) return;

    const correct: ExistingFinalSnapshot = {
      id: "final-ok",
      equipo1_id: PADELITO.eddie,
      equipo2_id: PADELITO.cuadra,
      estado: "upcoming",
      score_pareja1: null,
      score_pareja2: null,
      set_scores: null,
    };
    expect(planGranFinalSync(winners.winners, correct).action).toBe("noop");
    // Orden invertido también cuenta como misma pareja.
    const swapped: ExistingFinalSnapshot = {
      ...correct,
      equipo1_id: PADELITO.cuadra,
      equipo2_id: PADELITO.eddie,
    };
    expect(planGranFinalSync(winners.winners, swapped).action).toBe("noop");
  });

  it("I — ranking/sembrado no decide el avance a FINAL", () => {
    // Seeds congelados Padelito (Arturo #1 histórico): Arturo no avanza tras perder.
    const seeds = {
      "1": PADELITO.arturo,
      "2": PADELITO.cuadra,
      "3": PADELITO.kevin,
      "4": PADELITO.eddie,
    };
    const { crosses } = buildPlayoffCrosses(seeds);
    expect(crosses.find((c) => c.slot === "SF1")!.equipo1_id).toBe(
      PADELITO.arturo
    );

    const resolved = resolvePlayoffsSemifinalWinners([
      sfRow(
        "SF1",
        PADELITO.arturo,
        PADELITO.eddie,
        10,
        9,
        {
          format: PLAYOFFS_SCORE_FORMAT,
          sets: [
            { p1: 4, p2: 6 },
            { p1: 6, p2: 3 },
          ],
          stb: { p1: 4, p2: 10 },
          wo: false,
        }
      ),
      sfRow(
        "SF2",
        PADELITO.cuadra,
        PADELITO.kevin,
        12,
        7,
        {
          format: PLAYOFFS_SCORE_FORMAT,
          sets: [
            { p1: 6, p2: 4 },
            { p1: 6, p2: 3 },
          ],
          stb: null,
          wo: false,
        }
      ),
    ]);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const plan = planGranFinalSync(resolved.winners, null);
    expect(plan.action).toBe("create");
    if (plan.action !== "create") return;
    expect(new Set([plan.equipo1_id, plan.equipo2_id])).toEqual(
      new Set([PADELITO.eddie, PADELITO.cuadra])
    );
    expect(plan.equipo1_id).not.toBe(PADELITO.arturo);
    expect(plan.equipo2_id).not.toBe(PADELITO.arturo);
  });

  it("K — THIRD se genera con perdedores de SF (Arturo × Kevin)", () => {
    const resolved = resolvePlayoffsSemifinalWinners([
      sfRow(
        "SF1",
        PADELITO.arturo,
        PADELITO.eddie,
        10,
        9,
        {
          format: PLAYOFFS_SCORE_FORMAT,
          sets: [
            { p1: 4, p2: 6 },
            { p1: 6, p2: 3 },
          ],
          stb: { p1: 4, p2: 10 },
          wo: false,
        }
      ),
      sfRow(
        "SF2",
        PADELITO.cuadra,
        PADELITO.kevin,
        12,
        7,
        {
          format: PLAYOFFS_SCORE_FORMAT,
          sets: [
            { p1: 6, p2: 4 },
            { p1: 6, p2: 3 },
          ],
          stb: null,
          wo: false,
        }
      ),
    ]);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    const createPlan = planThirdPlaceSync(resolved.winners, null);
    expect(createPlan.action).toBe("create");
    if (createPlan.action !== "create") return;
    expect(new Set([createPlan.equipo1_id, createPlan.equipo2_id])).toEqual(
      new Set([PADELITO.arturo, PADELITO.kevin])
    );

    const existingOk: ExistingFinalSnapshot = {
      id: "third-ok",
      equipo1_id: PADELITO.arturo,
      equipo2_id: PADELITO.kevin,
      estado: "upcoming",
      score_pareja1: null,
      score_pareja2: null,
      set_scores: null,
    };
    expect(planThirdPlaceSync(resolved.winners, existingOk).action).toBe(
      "noop"
    );

    const scored: ExistingFinalSnapshot = {
      ...existingOk,
      id: "third-scored",
      estado: "completed",
      score_pareja1: 12,
      score_pareja2: 6,
      set_scores: {
        format: PLAYOFFS_SCORE_FORMAT,
        sets: [
          { p1: 6, p2: 3 },
          { p1: 6, p2: 3 },
        ],
        stb: null,
        wo: false,
      },
      equipo1_id: PADELITO.eddie,
      equipo2_id: PADELITO.cuadra,
    };
    expect(planThirdPlaceSync(resolved.winners, scored).action).toBe(
      "blocked_scored_mismatch"
    );
  });

  it("M — SF pendiente: no inventa ganadores ni plan de THIRD", () => {
    const resolved = resolvePlayoffsSemifinalWinners([
      sfRow(
        "SF1",
        PADELITO.arturo,
        PADELITO.eddie,
        10,
        9,
        {
          format: PLAYOFFS_SCORE_FORMAT,
          sets: [
            { p1: 4, p2: 6 },
            { p1: 6, p2: 3 },
          ],
          stb: { p1: 4, p2: 10 },
          wo: false,
        }
      ),
      sfRow(
        "SF2",
        PADELITO.cuadra,
        PADELITO.kevin,
        null as unknown as number,
        null as unknown as number,
        null,
        "upcoming"
      ),
    ]);
    expect(resolved.ok).toBe(false);
  });

  it("N — CL1/CL2 no se usan como semifinales para THIRD", () => {
    const withClAsSf = resolvePlayoffsSemifinalWinners([
      {
        bracket_slot: "CL1",
        estado: "completed",
        pareja1_equipo_id: PADELITO.arturo,
        pareja2_equipo_id: PADELITO.kevin,
        score_pareja1: 12,
        score_pareja2: 3,
        set_scores: {
          format: PLAYOFFS_SCORE_FORMAT,
          sets: [
            { p1: 6, p2: 1 },
            { p1: 6, p2: 2 },
          ],
          stb: null,
          wo: false,
        },
      },
      {
        bracket_slot: "CL2",
        estado: "completed",
        pareja1_equipo_id: PADELITO.eddie,
        pareja2_equipo_id: PADELITO.cuadra,
        score_pareja1: 12,
        score_pareja2: 1,
        set_scores: {
          format: PLAYOFFS_SCORE_FORMAT,
          sets: [
            { p1: 6, p2: 0 },
            { p1: 6, p2: 1 },
          ],
          stb: null,
          wo: false,
        },
      },
    ]);
    expect(withClAsSf.ok).toBe(false);
  });

  it("L — FINAL existente + THIRD ausente: solo plan create de THIRD", () => {
    const resolved = resolvePlayoffsSemifinalWinners([
      sfRow(
        "SF1",
        PADELITO.arturo,
        PADELITO.eddie,
        10,
        9,
        {
          format: PLAYOFFS_SCORE_FORMAT,
          sets: [
            { p1: 4, p2: 6 },
            { p1: 6, p2: 3 },
          ],
          stb: { p1: 4, p2: 10 },
          wo: false,
        }
      ),
      sfRow(
        "SF2",
        PADELITO.cuadra,
        PADELITO.kevin,
        12,
        7,
        {
          format: PLAYOFFS_SCORE_FORMAT,
          sets: [
            { p1: 6, p2: 4 },
            { p1: 6, p2: 3 },
          ],
          stb: null,
          wo: false,
        }
      ),
    ]);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    const finalOk: ExistingFinalSnapshot = {
      id: "a5806e1d-81ff-402a-9406-706be98b5f98",
      equipo1_id: PADELITO.eddie,
      equipo2_id: PADELITO.cuadra,
      estado: "completed",
      score_pareja1: 5,
      score_pareja2: 12,
      set_scores: {
        format: PLAYOFFS_SCORE_FORMAT,
        sets: [
          { p1: 1, p2: 6 },
          { p1: 4, p2: 6 },
        ],
        stb: null,
        wo: false,
      },
    };
    expect(planGranFinalSync(resolved.winners, finalOk).action).toBe("noop");
    expect(planThirdPlaceSync(resolved.winners, null).action).toBe("create");
  });

  it("J — regresión Padelito: FINAL incorrecta Arturo×Cuadra → Eddie×Cuadra", () => {
    const resolved = resolvePlayoffsSemifinalWinners([
      sfRow(
        "SF1",
        PADELITO.arturo,
        PADELITO.eddie,
        10,
        9,
        {
          format: PLAYOFFS_SCORE_FORMAT,
          sets: [
            { p1: 4, p2: 6 },
            { p1: 6, p2: 3 },
          ],
          stb: { p1: 4, p2: 10 },
          wo: false,
        }
      ),
      sfRow(
        "SF2",
        PADELITO.cuadra,
        PADELITO.kevin,
        12,
        7,
        {
          format: PLAYOFFS_SCORE_FORMAT,
          sets: [
            { p1: 6, p2: 4 },
            { p1: 6, p2: 3 },
          ],
          stb: null,
          wo: false,
        }
      ),
    ]);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    const wrong: ExistingFinalSnapshot = {
      id: "a5806e1d-81ff-402a-9406-706be98b5f98",
      equipo1_id: PADELITO.arturo,
      equipo2_id: PADELITO.cuadra,
      estado: "upcoming",
      score_pareja1: null,
      score_pareja2: null,
      set_scores: null,
    };
    const plan = planGranFinalSync(resolved.winners, wrong);
    expect(plan.action).toBe("update_unscored");
    if (plan.action !== "update_unscored") return;
    expect(new Set([plan.equipo1_id, plan.equipo2_id])).toEqual(
      new Set([PADELITO.eddie, PADELITO.cuadra])
    );
  });
});
