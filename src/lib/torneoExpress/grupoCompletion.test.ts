import { isGrupoPartidosCompletos } from "./grupoCompletion";
import type { TorneoExpressPartido } from "./types";

function partido(estado: "pendiente" | "jugado"): TorneoExpressPartido {
  return {
    id: "p1",
    grupo_id: "g1",
    pareja_local_id: "a",
    pareja_visitante_id: "b",
    puntos_local: null,
    puntos_visitante: null,
    ganador_id: null,
    estado,
    created_at: "",
  };
}

describe("isGrupoPartidosCompletos", () => {
  it("false sin partidos", () => {
    expect(isGrupoPartidosCompletos([])).toBe(false);
  });

  it("false si alguno pendiente", () => {
    expect(
      isGrupoPartidosCompletos([partido("jugado"), partido("pendiente")])
    ).toBe(false);
  });

  it("true si todos jugados", () => {
    expect(
      isGrupoPartidosCompletos([partido("jugado"), partido("jugado")])
    ).toBe(true);
  });
});
