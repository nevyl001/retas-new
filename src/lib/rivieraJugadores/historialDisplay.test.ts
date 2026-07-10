import {
  computePublicProfileStats,
  extractPartidosFromParticipacion,
  formatHistorialFecha,
  participacionToHistorialItem,
} from "./historialDisplay";
import type { JugadorParticipacion } from "./types";

function row(
  partial: Partial<JugadorParticipacion> & Pick<JugadorParticipacion, "tipo_evento">
): JugadorParticipacion {
  return {
    id: partial.id ?? "p1",
    jugador_id: partial.jugador_id ?? "j1",
    tipo_evento: partial.tipo_evento,
    evento_id: partial.evento_id ?? "e1",
    evento_nombre: partial.evento_nombre ?? "Evento",
    pareja_con: partial.pareja_con ?? null,
    resultado: partial.resultado ?? "participación",
    sets_favor: partial.sets_favor ?? 0,
    sets_contra: partial.sets_contra ?? 0,
    puntos_obtenidos: partial.puntos_obtenidos ?? 0,
    metadata: partial.metadata ?? {},
    fecha: partial.fecha ?? "2026-06-04",
    created_at: partial.created_at ?? "2026-06-04T12:00:00Z",
  };
}

describe("extractPartidosFromParticipacion", () => {
  it("cuenta partidos de jornada de liga cuando metadata trae W/L", () => {
    const m = extractPartidosFromParticipacion(
      row({
        tipo_evento: "liga",
        metadata: {
          subtipo: "liga_jornada",
          partidos_ganados: 2,
          partidos_perdidos: 1,
          partidos_jugados: 3,
        },
      })
    );
    expect(m).toEqual({ ganados: 2, perdidos: 1, empates: 0 });
  });

  it("no cuenta inscripción de liga como partido", () => {
    const m = extractPartidosFromParticipacion(
      row({
        tipo_evento: "liga",
        metadata: { subtipo: "liga_inscripcion" },
      })
    );
    expect(m).toEqual({ ganados: 0, perdidos: 0, empates: 0 });
  });
});

describe("computePublicProfileStats", () => {
  it("suma partidos de liga y reta en el perfil público", () => {
    const stats = computePublicProfileStats([
      row({
        tipo_evento: "liga",
        metadata: {
          subtipo: "liga_jornada",
          partidos_ganados: 2,
          partidos_perdidos: 1,
        },
      }),
      row({
        id: "p2",
        tipo_evento: "reta",
        metadata: {
          subtipo: "reta_cierre",
          partidos_ganados: 1,
          partidos_perdidos: 2,
        },
      }),
    ]);

    expect(stats.partidosGanados).toBe(3);
    expect(stats.partidosPerdidos).toBe(3);
    expect(stats.eventosJugados).toBe(2);
    expect(stats.ligas).toBe(1);
    expect(stats.retasClasicas).toBe(1);
  });
});

describe("participacionToHistorialItem fecha", () => {
  it("corrige fecha legacy vespertina con created_at", () => {
    const item = participacionToHistorialItem(
      row({
        tipo_evento: "duelo_2v2",
        evento_nombre: "Hack 5ta fza",
        fecha: "2026-07-10",
        created_at: "2026-07-10T00:30:00.000Z",
        metadata: { subtipo: "duelo_2v2_cierre" },
      })
    );
    expect(item.fecha).toBe("2026-07-09");
    expect(formatHistorialFecha(item.fecha)).toBe("9 jul 2026");
  });

  it("no retrocede fecha legacy matutina cuando hay created_at", () => {
    const item = participacionToHistorialItem(
      row({
        tipo_evento: "reta",
        evento_nombre: "Reta mañana",
        fecha: "2026-07-09",
        created_at: "2026-07-09T16:00:00.000Z",
        metadata: { subtipo: "reta_cierre" },
      })
    );
    expect(item.fecha).toBe("2026-07-09");
    expect(formatHistorialFecha(item.fecha)).toBe("9 jul 2026");
  });
});
