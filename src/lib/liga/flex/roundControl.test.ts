import fs from "fs";
import path from "path";
import { FLEX_MAX_ROUNDS } from "./constants";
import {
  adjustFlexTarget,
  flexActiveRound,
  flexRoundActionVisible,
  flexRoundEditMode,
  flexScoredRoundFloor,
  nextFlexRoundAction,
  resetFlexJornadaGuard,
} from "./roundControl";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/0144_flex_ronda_progresiva.sql"),
  "utf8"
);

const correctionSql = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/0145_flex_corregir_marcador.sql"),
  "utf8"
);

describe("control de rondas Flex", () => {
  it("no baja el objetivo por debajo de una ronda con marcador", () => {
    const matches = [
      { round: 1, scoreA: 6, scoreB: 4 },
      { round: 2, scoreA: null, scoreB: null },
    ];
    expect(flexScoredRoundFloor(matches)).toBe(1);
    expect(adjustFlexTarget({ current: 7, next: 1, matches }).ok).toBe(true);
    expect(adjustFlexTarget({ current: 7, next: 0, matches }).ok).toBe(false);
    expect(adjustFlexTarget({ current: 7, next: FLEX_MAX_ROUNDS + 1, matches }).ok).toBe(false);
    const kept = adjustFlexTarget({
      current: 7,
      next: 1,
      matches: [
        { round: 1, scoreA: 6, scoreB: 3 },
        { round: 2, scoreA: 1, scoreB: null },
      ],
    });
    expect(kept.ok).toBe(false);
  });

  it("genera solo la siguiente ronda y exige confirmación previa", () => {
    expect(
      nextFlexRoundAction({
        target: 7,
        generatedRounds: [],
        confirmedRounds: [],
        matches: [],
      })
    ).toEqual({ kind: "generate", round: 1 });

    expect(
      nextFlexRoundAction({
        target: 7,
        generatedRounds: [1],
        confirmedRounds: [],
        matches: [{ round: 1, scoreA: null, scoreB: null }],
      }).kind
    ).toBe("replace");

    expect(
      nextFlexRoundAction({
        target: 7,
        generatedRounds: [1],
        confirmedRounds: [],
        matches: [{ round: 1, scoreA: 6, scoreB: 4 }],
      })
    ).toEqual({ kind: "confirm", round: 1 });

    expect(
      nextFlexRoundAction({
        target: 7,
        generatedRounds: [1],
        confirmedRounds: [1],
        matches: [{ round: 1, scoreA: 6, scoreB: 4 }],
      })
    ).toEqual({ kind: "generate", round: 2 });

    expect(
      nextFlexRoundAction({
        target: 1,
        generatedRounds: [1],
        confirmedRounds: [1],
        matches: [{ round: 1, scoreA: 6, scoreB: 4 }],
      }).kind
    ).toBe("blocked");

    expect(
      nextFlexRoundAction({
        target: 7,
        generatedRounds: [1, 2, 3, 4, 5, 6, 7],
        confirmedRounds: [],
        matches: [
          { round: 1, scoreA: 6, scoreB: 4 },
          { round: 2, scoreA: null, scoreB: null },
        ],
      })
    ).toEqual({ kind: "confirm", round: 1 });

    const future = nextFlexRoundAction({
      target: 7,
      generatedRounds: [1, 2, 3],
      confirmedRounds: [1],
      matches: [
        { round: 1, scoreA: 6, scoreB: 4 },
        { round: 2, scoreA: null, scoreB: null },
        { round: 3, scoreA: null, scoreB: null },
      ],
    });
    expect(future.kind).toBe("blocked");
  });

  it("confirma dos veces sin abrir la siguiente y bloquea el reinicio de una temporada cerrada", () => {
    const again = nextFlexRoundAction({
      target: 5,
      generatedRounds: [1],
      confirmedRounds: [1],
      matches: [{ round: 1, scoreA: 6, scoreB: 2 }],
    });
    expect(again).toEqual({ kind: "generate", round: 2 });
    expect(resetFlexJornadaGuard({ seasonClosed: false, championJornada: false }).ok).toBe(true);
    expect(resetFlexJornadaGuard({ seasonClosed: true, championJornada: false }).ok).toBe(false);
    expect(resetFlexJornadaGuard({ seasonClosed: false, championJornada: true }).ok).toBe(false);
  });

  it("la migración confirma, ajusta y reinicia una sola jornada", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.flex_guardar_ronda");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.flex_confirmar_ronda");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.flex_ajustar_rondas");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.flex_reiniciar_jornada");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("'idempotent', true");
    expect(sql).toContain("Confirma la ronda anterior");
    expect(sql).toContain("accion = 'confirmar_ronda'");
    expect(sql).toContain("WHERE jornada_id = p_jornada_id");
    expect(sql).not.toContain("coach_class_ledger");
    expect(sql).not.toContain("DELETE FROM public.liga_jornada_participantes");
    expect(sql).not.toContain("DELETE FROM public.ligas");
    expect(sql.match(/GRANT EXECUTE ON FUNCTION public.flex_reiniciar_jornada/g)?.length).toBe(1);
    expect(sql).toContain("TO authenticated");
    expect(sql).not.toMatch(/GRANT EXECUTE[\s\S]*TO anon/);
  });

  it("separa modo de captura y modo confirmado por ronda o jornada finalizada", () => {
    // Ronda en curso (no confirmada) -> capture
    expect(
      flexRoundEditMode({
        round: 2,
        confirmedRounds: [1],
        jornadaCompleted: false,
        seasonClosed: false,
      })
    ).toBe("capture");

    // Ronda anterior confirmada mientras la jornada continúa -> confirmed
    expect(
      flexRoundEditMode({
        round: 1,
        confirmedRounds: [1],
        jornadaCompleted: false,
        seasonClosed: false,
      })
    ).toBe("confirmed");

    // Cualquier ronda en jornada finalizada -> confirmed
    expect(
      flexRoundEditMode({
        round: 2,
        confirmedRounds: [1],
        jornadaCompleted: true,
        seasonClosed: false,
      })
    ).toBe("confirmed");

    // Temporada cerrada con campeón -> locked
    expect(
      flexRoundEditMode({
        round: 1,
        confirmedRounds: [1],
        jornadaCompleted: true,
        seasonClosed: true,
      })
    ).toBe("locked");
  });

  it("oculta el botón Confirmar ronda al consultar una ronda anterior confirmada", () => {
    const action = nextFlexRoundAction({
      target: 6,
      generatedRounds: [1, 2, 3, 4, 5, 6],
      confirmedRounds: [1, 2, 3, 4, 5],
      matches: [
        { round: 1, scoreA: 6, scoreB: 2 },
        { round: 2, scoreA: 6, scoreB: 4 },
        { round: 3, scoreA: 6, scoreB: 3 },
        { round: 4, scoreA: 6, scoreB: 1 },
        { round: 5, scoreA: 6, scoreB: 5 },
        { round: 6, scoreA: 6, scoreB: 4 },
      ],
    });
    expect(action).toEqual({ kind: "confirm", round: 6 });
    expect(flexActiveRound(action, [1, 2, 3, 4, 5, 6])).toBe(6);

    // Consultando R02 mientras R06 está activa: no mostrar Confirmar ronda 6
    expect(flexRoundActionVisible(action, 2, [1, 2, 3, 4, 5, 6])).toBe(false);

    // Consultando R06 (la ronda activa): sí mostrar Confirmar ronda 6
    expect(flexRoundActionVisible(action, 6, [1, 2, 3, 4, 5, 6])).toBe(true);
  });

  it("la migración 0145 corrige marcador individual con auditoría y recálculo sin duplicar puntos", () => {
    expect(correctionSql).toContain("CREATE OR REPLACE FUNCTION public.flex_corregir_marcador");
    expect(correctionSql).toContain("public.flex_league_can_write(v_liga)");
    expect(correctionSql).toContain("pg_advisory_xact_lock");
    expect(correctionSql).toContain(
      "Escribe el motivo de la corrección (mínimo 4 caracteres)."
    );
    expect(correctionSql).toContain("public.flex_rank_scores(v_jornada, p_orden)");
    expect(correctionSql).toContain("public.flex_escribir_posiciones(v_jornada, v_rank->'rows')");
    expect(correctionSql).toContain("'corregir_marcador'");
    expect(correctionSql).toContain("'anterior', jsonb_build_object('a', v_prev_a, 'b', v_prev_b)");
    expect(correctionSql).toContain("'nuevo', jsonb_build_object('a', p_score_a, 'b', p_score_b)");
    expect(correctionSql).toContain(
      "La ronda ya está confirmada. Usa Editar para corregirla con motivo."
    );
    expect(correctionSql).toContain("TO authenticated");
    expect(correctionSql).not.toMatch(/GRANT EXECUTE[\s\S]*TO anon/);
  });
});
