import { buildCategoriaPublicCardStats } from "./categoriaPublicCardStats";
import type { TorneoExpress } from "./types";

const baseCat = (
  patch: Partial<TorneoExpress> & Pick<TorneoExpress, "id">
): TorneoExpress => ({
  id: patch.id,
  nombre: "Test",
  organizador_id: "o1",
  categoria: "3ra",
  estado: patch.estado ?? "en_curso",
  source_tournament_id: null,
  created_at: "2026-01-01",
  fase_torneo: patch.fase_torneo ?? "grupos",
  fase_eliminacion: patch.fase_eliminacion ?? null,
  bracket_slots: patch.bracket_slots,
});

describe("buildCategoriaPublicCardStats", () => {
  it("arma face de fase de grupos con progreso", () => {
    const s = buildCategoriaPublicCardStats({
      categoria: baseCat({ id: "c1", fase_torneo: "grupos" }),
      grupos: [
        { id: "g1", torneo_id: "c1", nombre: "Grupo A", orden: 1 },
        { id: "g2", torneo_id: "c1", nombre: "Grupo B", orden: 2 },
      ],
      stats: { parejaCount: 6, partidoTotal: 12, partidoJugados: 6 },
      eliminatoriaPartidos: [],
    });
    expect(s.title).toMatch(/3ra/i);
    expect(s.estadoLabel).toBe("En curso");
    expect(s.phaseLabel).toBe("Fase de grupos");
    expect(s.gruposCount).toBe(2);
    expect(s.parejaCount).toBe(6);
    expect(s.partidoJugados).toBe(6);
    expect(s.partidoTotal).toBe(12);
    expect(s.progress01).toBe(0.5);
    expect(s.hasEliminatoria).toBe(false);
    expect(s.hasGrupos).toBe(true);
  });

  it("sin partidos no muestra progreso", () => {
    const s = buildCategoriaPublicCardStats({
      categoria: baseCat({ id: "c1" }),
      grupos: [],
      stats: undefined,
      eliminatoriaPartidos: [],
    });
    expect(s.progress01).toBeNull();
    expect(s.hasGrupos).toBe(false);
  });

  it("detecta eliminatoria con helpers existentes", () => {
    const s = buildCategoriaPublicCardStats({
      categoria: baseCat({
        id: "c2",
        fase_torneo: "eliminatoria",
        fase_eliminacion: "semifinal",
      }),
      grupos: [{ id: "g1", torneo_id: "c2", nombre: "Grupo A", orden: 1 }],
      stats: { parejaCount: 4, partidoTotal: 6, partidoJugados: 6 },
      eliminatoriaPartidos: [
        {
          ronda: 1,
          orden: 1,
          estado: "pendiente",
          es_bye: false,
          ganador_id: null,
        },
      ],
    });
    expect(s.hasEliminatoria).toBe(true);
    expect(s.phaseLabel).toBe("Semifinales");
    expect(s.progress01).toBe(1);
  });
});
