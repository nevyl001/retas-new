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

describe("participacionToHistorialItem categoría de torneo express", () => {
  const torneoRow = (
    id: string,
    metadata: Record<string, unknown>,
    evento_nombre = "Hack Padel Fest"
  ) =>
    row({
      id,
      tipo_evento: "torneo_express",
      evento_id: `torneo-${id}`,
      evento_nombre,
      metadata,
    });

  it("muestra la categoría real distinta para cada categoría del mismo evento", () => {
    const items = [
      torneoRow("a", { categoria: "4ta Fuerza" }),
      torneoRow("b", { categoria: "5ta Fuerza" }),
      torneoRow("c", { categoria: "Mixtos D" }),
    ].map((r) =>
      participacionToHistorialItem(r, { categoriaFallback: "5ta_fuerza" })
    );

    expect(items.map((i) => i.eventoNombre)).toEqual([
      "Hack Padel Fest — 4ta Fuerza",
      "Hack Padel Fest — 5ta Fuerza",
      "Hack Padel Fest — Mixtos D",
    ]);
  });

  it("la categoría del torneo tiene prioridad sobre la del perfil", () => {
    const item = participacionToHistorialItem(
      torneoRow("a", { categoria: "Mixtos D", jugador_categoria: "5ta_fuerza" }),
      { categoriaFallback: "5ta_fuerza" }
    );
    expect(item.categoriaLabel).toBe("Mixtos D");
    expect(item.eventoNombre).toBe("Hack Padel Fest — Mixtos D");
  });

  it("acepta categorías personalizadas del torneo", () => {
    const item = participacionToHistorialItem(
      torneoRow("a", { categoria: "Femenil C" })
    );
    expect(item.eventoNombre).toBe("Hack Padel Fest — Femenil C");
  });

  it("normaliza claves canónicas de categoría", () => {
    const item = participacionToHistorialItem(
      torneoRow("a", { categoria: "4ta_fuerza" })
    );
    expect(item.eventoNombre).toBe("Hack Padel Fest — 4ta fuerza");
  });

  it("registro histórico sin metadata.categoria no hereda la categoría del perfil", () => {
    const item = participacionToHistorialItem(torneoRow("a", {}), {
      categoriaFallback: "5ta_fuerza",
    });
    expect(item.categoriaLabel).toBeUndefined();
    expect(item.eventoNombre).toBe("Hack Padel Fest");
    expect(item.detalle ?? "").not.toContain("5ta fuerza");
  });

  it("no duplica la categoría si el nombre del evento ya la incluye", () => {
    const cases: Array<[string, string]> = [
      ["Hack 5ta Fuerza", "5ta Fuerza"],
      ["Hack 5ta fza", "5ta Fuerza"],
      ["Copa Mixtos D", "Mixtos D"],
      ["Copa MIXTOS D", "mixtos d"],
    ];
    for (const [nombre, categoria] of cases) {
      const item = participacionToHistorialItem(
        torneoRow("a", { categoria }, nombre)
      );
      expect(item.eventoNombre).toBe(nombre);
    }
  });

  it("no repite la categoría en el detalle (ya está en el título)", () => {
    const item = participacionToHistorialItem(
      torneoRow("a", {
        categoria: "4ta Fuerza",
        partidos_ganados: 0,
        partidos_perdidos: 2,
      })
    );
    expect(item.detalle ?? "").not.toContain("4ta Fuerza");
    expect(item.detalle).toContain("2 derrotas");
  });

  it("no cambia el comportamiento de ligas, retas ni americanos", () => {
    for (const tipo of ["liga", "reta", "americano"] as const) {
      const conMeta = participacionToHistorialItem(
        row({
          tipo_evento: tipo,
          evento_nombre: "Evento X",
          metadata: { categoria: "4ta_fuerza" },
        }),
        { categoriaFallback: "5ta_fuerza" }
      );
      expect(conMeta.eventoNombre).toBe("Evento X");
      expect(conMeta.detalle).toContain("4ta fuerza");

      const sinMeta = participacionToHistorialItem(
        row({ tipo_evento: tipo, evento_nombre: "Evento X" }),
        { categoriaFallback: "5ta_fuerza" }
      );
      expect(sinMeta.eventoNombre).toBe("Evento X");
      expect(sinMeta.categoriaLabel).toBe("5ta fuerza");
      expect(sinMeta.detalle).toContain("5ta fuerza");
    }
  });
});
