import {
  ligaAvanceLabel,
  ligaEstadoLabel,
  ligaParticipantesLabel,
} from "./LigaListaCard";
import type { Liga } from "../../lib/liga/types";

function liga(overrides: Partial<Liga> = {}): Liga {
  return {
    id: "l1",
    nombre: "Liga 5ta Advance",
    estado: "in_progress",
    modalidad: "individual_rotativo",
    vueltas: 1,
    organizador_id: "org",
    canchas_disponibles: 3,
    fecha_inicio: null,
    fecha_fin: null,
    created_at: "2026-01-01",
    inscripciones_count: 12,
    equipos_count: 0,
    jornadas_count: 8,
    jornada_actual_numero: 3,
    ...overrides,
  };
}

describe("LigaListaCard helpers", () => {
  it("etiquetas de estado y participantes", () => {
    expect(ligaEstadoLabel("upcoming")).toBe("Programada");
    expect(ligaEstadoLabel("in_progress")).toBe("En curso");
    expect(ligaEstadoLabel("completed")).toBe("Finalizada");
    expect(ligaParticipantesLabel(liga())).toBe("12 jugadores");
    expect(
      ligaParticipantesLabel(
        liga({ modalidad: "parejas_fijas", equipos_count: 1 })
      )
    ).toBe("1 pareja");
  });

  it("avance de jornadas solo con datos reales", () => {
    expect(ligaAvanceLabel(liga())).toBe("Jornada 3 de 8");
    expect(ligaAvanceLabel(liga({ jornada_actual_numero: null }))).toBe(
      "8 jornadas"
    );
    expect(
      ligaAvanceLabel(liga({ jornadas_count: 0, jornada_actual_numero: null }))
    ).toBeNull();
  });
});
