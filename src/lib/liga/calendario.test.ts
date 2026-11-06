import {
  calendarioDesactualizado,
  type SustitucionCalendario,
} from "./calendario";
import type { LigaDetalle, LigaInscripcion, LigaJornada } from "./types";

const ARTURO = "arturo";
const SAUL = "saul";
const B = "jugador-b";
const C = "jugador-c";
const REST = ["p1", "p2", "p3"];

function inscripcion(
  id: string,
  jugadorId: string,
  puntos = 0,
  heredados = 0
): LigaInscripcion {
  return {
    id,
    liga_id: "liga-1",
    jugador_id: jugadorId,
    puntos,
    puntos_heredados: heredados,
  };
}

function jornada(
  numero: number,
  jugadores: string[],
  estado: LigaJornada["estado"] = "upcoming"
): LigaJornada {
  const parejas = [];
  for (let i = 0; i < jugadores.length; i += 2) {
    parejas.push({
      id: `pareja-${numero}-${i}`,
      jornada_id: `j${numero}`,
      jugador1_id: jugadores[i] ?? "",
      jugador2_id: jugadores[i + 1] ?? "",
    });
  }
  return {
    id: `j${numero}`,
    liga_id: "liga-1",
    numero,
    estado,
    fecha: null,
    created_at: "2026-01-01",
    parejas,
    partidos:
      estado === "completed"
        ? [
            {
              id: `m-${numero}`,
              jornada_id: `j${numero}`,
              pareja1_id: parejas[0]?.id ?? "",
              pareja2_id: parejas[1]?.id ?? "",
              score_pareja1: 6,
              score_pareja2: 4,
              cancha: 1,
              ronda: 1,
              estado: "completed",
              created_at: "2026-01-01",
            },
          ]
        : [],
  };
}

function liga(
  jornadas: LigaJornada[],
  inscripciones: LigaInscripcion[]
): LigaDetalle {
  return {
    id: "liga-1",
    nombre: "Liga de prueba",
    estado: "in_progress",
    modalidad: "individual_rotativo",
    vueltas: 1,
    organizador_id: null,
    canchas_disponibles: 3,
    fecha_inicio: null,
    fecha_fin: null,
    created_at: "2026-01-01",
    inscripciones,
    equipos: [],
    jugadores: [],
    jornadas,
  };
}

function roster(titular: string): string[] {
  return [titular, ...REST];
}

describe("calendario individual y sustituciones", () => {
  const plaza = inscripcion("plaza-1", SAUL, 18, 18);
  const otras = REST.map((id, index) => inscripcion(`plaza-${index + 2}`, id));

  it("1 — sin sustituciones el calendario coincide", () => {
    const jugadores = roster(ARTURO);
    const detalle = liga(
      [1, 2, 3].map((n) => jornada(n, jugadores)),
      [inscripcion("plaza-1", ARTURO), ...otras]
    );
    expect(calendarioDesactualizado(detalle)).toBe(false);
  });

  it("2 — sustitución desde la jornada 2 es consistente", () => {
    const detalle = liga(
      [
        jornada(1, roster(ARTURO), "completed"),
        jornada(2, roster(SAUL)),
        jornada(3, roster(SAUL)),
      ],
      [plaza, ...otras]
    );
    const subs: SustitucionCalendario[] = [
      {
        fromJugadorId: ARTURO,
        toJugadorId: SAUL,
        ingresoJornadaNumero: 2,
        plazaInscripcionId: "plaza-1",
      },
    ];
    expect(calendarioDesactualizado(detalle, subs)).toBe(false);
  });

  it("3 — sustitución desde la jornada 5 es consistente", () => {
    const detalle = liga(
      [1, 2, 3, 4, 5, 6].map((n) =>
        jornada(n, roster(n < 5 ? ARTURO : SAUL), n < 5 ? "completed" : "upcoming")
      ),
      [plaza, ...otras]
    );
    expect(
      calendarioDesactualizado(detalle, [
        {
          fromJugadorId: ARTURO,
          toJugadorId: SAUL,
          ingresoJornadaNumero: 5,
          plazaInscripcionId: "plaza-1",
        },
      ])
    ).toBe(false);
  });

  it("4 — dos sustituciones sucesivas siguen siendo consistentes", () => {
    const titular = (n: number) => (n < 4 ? ARTURO : n < 7 ? B : C);
    const detalle = liga(
      [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
        jornada(n, roster(titular(n)), n < 4 ? "completed" : "upcoming")
      ),
      [inscripcion("plaza-1", C, 18, 18), ...otras]
    );
    expect(
      calendarioDesactualizado(detalle, [
        {
          fromJugadorId: ARTURO,
          toJugadorId: B,
          ingresoJornadaNumero: 4,
          plazaInscripcionId: "plaza-1",
        },
        {
          fromJugadorId: B,
          toJugadorId: C,
          ingresoJornadaNumero: 7,
          plazaInscripcionId: "plaza-1",
        },
      ])
    ).toBe(false);
  });

  it("5 — un reemplazo manual sin sustitución mantiene la advertencia", () => {
    const detalle = liga(
      [jornada(1, roster(ARTURO), "completed"), jornada(2, roster(ARTURO))],
      [plaza, ...otras]
    );
    expect(calendarioDesactualizado(detalle, [])).toBe(true);
  });

  it("6 — un jugador ajeno al calendario mantiene la advertencia", () => {
    const detalle = liga(
      [
        jornada(1, roster(ARTURO), "completed"),
        jornada(2, ["intruso", ...REST]),
      ],
      [plaza, ...otras]
    );
    expect(
      calendarioDesactualizado(detalle, [
        {
          fromJugadorId: ARTURO,
          toJugadorId: SAUL,
          ingresoJornadaNumero: 2,
          plazaInscripcionId: "plaza-1",
        },
      ])
    ).toBe(true);
  });

  it("7 — la validación no modifica marcadores ni el estado de las jornadas", () => {
    const detalle = liga(
      [jornada(1, roster(ARTURO), "completed"), jornada(2, roster(SAUL))],
      [plaza, ...otras]
    );
    const antes = JSON.stringify(detalle);
    calendarioDesactualizado(detalle, [
      {
        fromJugadorId: ARTURO,
        toJugadorId: SAUL,
        ingresoJornadaNumero: 2,
        plazaInscripcionId: "plaza-1",
      },
    ]);
    expect(JSON.stringify(detalle)).toBe(antes);
    expect(detalle.jornadas[0]?.estado).toBe("completed");
    expect(detalle.jornadas[0]?.partidos?.[0]?.score_pareja1).toBe(6);
    expect(detalle.jornadas[1]?.estado).toBe("upcoming");
  });

  it("8 — los puntos heredados no se duplican ni se recalculan", () => {
    const detalle = liga(
      [jornada(1, roster(ARTURO), "completed"), jornada(2, roster(SAUL))],
      [plaza, ...otras]
    );
    calendarioDesactualizado(detalle, [
      {
        fromJugadorId: ARTURO,
        toJugadorId: SAUL,
        ingresoJornadaNumero: 2,
        plazaInscripcionId: "plaza-1",
      },
    ]);
    expect(detalle.inscripciones[0]?.puntos).toBe(18);
    expect(detalle.inscripciones[0]?.puntos_heredados).toBe(18);
    const total = detalle.inscripciones.reduce(
      (sum, row) => sum + (row.puntos_heredados ?? 0),
      0
    );
    expect(total).toBe(18);
  });

  it("9 — una jornada futura con el jugador saliente sigue siendo inconsistente", () => {
    const detalle = liga(
      [
        jornada(1, roster(ARTURO), "completed"),
        jornada(2, roster(ARTURO)),
      ],
      [plaza, ...otras]
    );
    expect(
      calendarioDesactualizado(detalle, [
        {
          fromJugadorId: ARTURO,
          toJugadorId: SAUL,
          ingresoJornadaNumero: 2,
          plazaInscripcionId: "plaza-1",
        },
      ])
    ).toBe(true);
  });

  it("10 — repetir la validación no altera la liga", () => {
    const detalle = liga(
      [jornada(1, roster(ARTURO), "completed"), jornada(2, roster(SAUL))],
      [plaza, ...otras]
    );
    const subs: SustitucionCalendario[] = [
      {
        fromJugadorId: ARTURO,
        toJugadorId: SAUL,
        ingresoJornadaNumero: 2,
        plazaInscripcionId: "plaza-1",
      },
    ];
    const first = calendarioDesactualizado(detalle, subs);
    const second = calendarioDesactualizado(detalle, subs);
    expect(first).toBe(false);
    expect(second).toBe(first);
    expect(detalle.jornadas).toHaveLength(2);
    expect(detalle.inscripciones).toHaveLength(4);
  });
});
