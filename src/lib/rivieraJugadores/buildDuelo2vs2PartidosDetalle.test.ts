import type { Duelo2v2 } from "../duelo2v2/types";
import { buildDuelo2vs2PartidosDetalle } from "./buildDuelo2vs2PartidosDetalle";

const duelo: Duelo2v2 = {
  id: "d1",
  organizador_id: "org",
  nombre: "Duelo test",
  descripcion: null,
  cancha: "1",
  programado_en: "2026-06-01T18:00:00Z",
  programado_hasta: "2026-06-01T20:00:00Z",
  estado: "finalizado",
  pareja_a_j1_id: null,
  pareja_a_j2_id: null,
  pareja_a_j1_nombre: "A1",
  pareja_a_j2_nombre: "A2",
  pareja_b_j1_id: null,
  pareja_b_j2_id: null,
  pareja_b_j1_nombre: "B1",
  pareja_b_j2_nombre: "B2",
  sets_pareja_a: 2,
  sets_pareja_b: 1,
  detalle_sets: [
    { a: 6, b: 4 },
    { a: 3, b: 6 },
    { a: 7, b: 5 },
  ],
  ganador: "a",
  created_at: "2026-06-01T10:00:00Z",
  updated_at: "2026-06-01T11:00:00Z",
  finalizado_at: "2026-06-01T11:00:00Z",
};

describe("buildDuelo2vs2PartidosDetalle", () => {
  it("genera un partido con games acumulados de sets", () => {
    const detalle = buildDuelo2vs2PartidosDetalle({ duelo, esParejaA: true });
    expect(detalle).toHaveLength(1);
    expect(detalle[0]).toMatchObject({
      fase: "Duelo",
      rival: "B1 / B2",
      games_favor: 16,
      games_contra: 15,
      resultado: "win",
    });
  });

  it("marca loss para pareja perdedora", () => {
    const detalle = buildDuelo2vs2PartidosDetalle({ duelo, esParejaA: false });
    expect(detalle[0].resultado).toBe("loss");
    expect(detalle[0].rival).toBe("A1 / A2");
  });
});
