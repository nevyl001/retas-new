import {
  buildCategoriaPublicPhasePresentation,
  hasCategoriaEliminatoria,
  resolveCategoriaPhaseLabel,
} from "./categoriaPublicPhase";
import type { TorneoExpress } from "./types";

const baseCat = (
  patch: Partial<TorneoExpress> & Pick<TorneoExpress, "id">
): TorneoExpress => ({
  id: patch.id,
  nombre: "Test",
  organizador_id: "o1",
  categoria: "5ta",
  estado: patch.estado ?? "en_curso",
  source_tournament_id: null,
  created_at: "2026-01-01",
  fase_torneo: patch.fase_torneo ?? "grupos",
  fase_eliminacion: patch.fase_eliminacion ?? null,
  bracket_slots: patch.bracket_slots,
});

describe("categoriaPublicPhase", () => {
  it("hasCategoriaEliminatoria exige fase + partidos persistidos", () => {
    expect(hasCategoriaEliminatoria("grupos", 4)).toBe(false);
    expect(hasCategoriaEliminatoria("eliminatoria", 0)).toBe(false);
    expect(hasCategoriaEliminatoria("eliminatoria", 2)).toBe(true);
    expect(hasCategoriaEliminatoria("cerrado", 1)).toBe(true);
  });

  it("fase de grupos sin cuadro", () => {
    const p = buildCategoriaPublicPhasePresentation(
      baseCat({ id: "c1", fase_torneo: "grupos" }),
      []
    );
    expect(p.phaseLabel).toBe("Fase de grupos");
    expect(p.primaryActionLabel).toBe("Ver grupos y partidos");
    expect(p.primaryHref).toBe("/torneo-express/c1/grupos");
    expect(p.secondaryHref).toBeUndefined();
  });

  it("eliminatoria con semifinales abiertas prioriza fase final", () => {
    const p = buildCategoriaPublicPhasePresentation(
      baseCat({
        id: "c2",
        fase_torneo: "eliminatoria",
        fase_eliminacion: "semifinal",
      }),
      [
        { ronda: 1, orden: 1, estado: "pendiente", es_bye: false, ganador_id: null },
        { ronda: 1, orden: 2, estado: "pendiente", es_bye: false, ganador_id: null },
      ]
    );
    expect(p.hasEliminatoria).toBe(true);
    expect(p.phaseLabel).toBe("Semifinales");
    expect(p.primaryActionLabel).toBe("Ver fase final");
    expect(p.primaryHref).toBe("/torneo-express/c2/eliminatoria");
    expect(p.secondaryActionLabel).toBe("Ver grupos y resultados");
    expect(p.secondaryHref).toBe("/torneo-express/c2/grupos");
  });

  it("cerrado muestra Finalizado y sigue ofreciendo fase final", () => {
    const p = buildCategoriaPublicPhasePresentation(
      baseCat({
        id: "c3",
        fase_torneo: "cerrado",
        estado: "finalizado",
        fase_eliminacion: "semifinal",
      }),
      [
        {
          ronda: 2,
          orden: 1,
          estado: "jugado",
          es_bye: false,
          ganador_id: "a",
        },
      ]
    );
    expect(p.phaseLabel).toBe("Finalizado");
    expect(p.primaryHref).toContain("/eliminatoria");
    expect(p.secondaryHref).toContain("/grupos");
  });

  it("no marca eliminatoria solo porque terminó la fase de grupos", () => {
    expect(
      resolveCategoriaPhaseLabel({
        faseTorneo: "grupos",
        estado: "en_curso",
        faseEliminacion: null,
        eliminatoriaPartidos: [],
      })
    ).toBe("Fase de grupos");
  });
});
