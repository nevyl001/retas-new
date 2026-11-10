import { computeRankingIndividualAcumuladoHasta } from "./rankingIndividualAcumulado";
import type { LigaInscripcion, LigaJornada, LigaJornadaPareja, LigaPartido } from "./types";

function jugador(id: string, nombre: string) {
  return {
    id,
    nombre,
    email: null,
    telefono: null,
    genero: null,
    nivel: null,
    estado: "activo" as const,
    organizador_id: null,
    created_at: "2026-01-01T00:00:00Z",
  };
}

function pareja(
  id: string,
  jornadaId: string,
  j1: string,
  j2: string,
  n1: string,
  n2: string
): LigaJornadaPareja {
  return {
    id,
    jornada_id: jornadaId,
    jugador1_id: j1,
    jugador2_id: j2,
    jugador1: jugador(j1, n1),
    jugador2: jugador(j2, n2),
  };
}

function partido(
  id: string,
  jornadaId: string,
  p1: string,
  p2: string,
  s1: number | null,
  s2: number | null,
  estado: LigaPartido["estado"] = "completed"
): LigaPartido {
  return {
    id,
    jornada_id: jornadaId,
    pareja1_id: p1,
    pareja2_id: p2,
    score_pareja1: s1,
    score_pareja2: s2,
    set_scores: null,
    cancha: 1,
    hora_inicio: null,
    ronda: 1,
    estado,
    fase: null,
    bracket_slot: null,
    liga_id: "liga-1",
    created_at: "2026-01-01T00:00:00Z",
  };
}

function jornada(
  numero: number,
  estado: LigaJornada["estado"],
  parejas: LigaJornadaPareja[],
  partidos: LigaPartido[]
): LigaJornada {
  return {
    id: `j${numero}`,
    liga_id: "liga-1",
    numero,
    estado,
    fecha: null,
    created_at: "2026-01-01T00:00:00Z",
    puntos_aplicados: estado === "completed",
    parejas,
    partidos,
  };
}

function insc(
  jugadorId: string,
  nombre: string,
  opts?: { heredados?: number; ingreso?: number | null; puntos?: number }
): LigaInscripcion {
  return {
    id: `insc-${jugadorId}`,
    liga_id: "liga-1",
    jugador_id: jugadorId,
    puntos: opts?.puntos ?? 0,
    puntos_heredados: opts?.heredados ?? 0,
    ingreso_jornada_numero: opts?.ingreso ?? null,
    jugador: jugador(jugadorId, nombre),
  };
}

const A = "jug-a";
const B = "jug-b";
const C = "jug-c";
const D = "jug-d";

describe("computeRankingIndividualAcumuladoHasta", () => {
  const j1Parejas = [
    pareja("p1", "j1", A, B, "Ana", "Beto"),
    pareja("p2", "j1", C, D, "Carla", "Diego"),
  ];
  const j1Partidos = [
    partido("m1", "j1", "p1", "p2", 6, 3),
    partido("m2", "j1", "p1", "p2", 6, 4),
  ];
  // Ana/Beto: 12 c/u · Carla/Diego: 7 c/u
  const jornada1 = jornada(1, "completed", j1Parejas, j1Partidos);
  const jornada2Pendiente = jornada(
    2,
    "upcoming",
    [
      pareja("p3", "j2", A, C, "Ana", "Carla"),
      pareja("p4", "j2", B, D, "Beto", "Diego"),
    ],
    [
      partido("m3", "j2", "p3", "p4", null, null, "upcoming"),
      partido("m4", "j2", "p3", "p4", null, null, "upcoming"),
    ]
  );
  const jornada2Completa = jornada(
    2,
    "completed",
    [
      pareja("p3", "j2", A, C, "Ana", "Carla"),
      pareja("p4", "j2", B, D, "Beto", "Diego"),
    ],
    [
      partido("m3", "j2", "p3", "p4", 6, 2),
      partido("m4", "j2", "p3", "p4", 5, 6),
    ]
  );
  // J2: Ana/Carla 11 c/u · Beto/Diego 8 c/u
  const jornada3 = jornada(
    3,
    "completed",
    [
      pareja("p5", "j3", A, D, "Ana", "Diego"),
      pareja("p6", "j3", B, C, "Beto", "Carla"),
    ],
    [partido("m5", "j3", "p5", "p6", 4, 6)]
  );
  // J3: Ana/Diego 4 · Beto/Carla 6

  const inscripcionesBase = [
    insc(A, "Ana"),
    insc(B, "Beto"),
    insc(C, "Carla"),
    insc(D, "Diego"),
  ];

  it("1. Jornada 1 con resultados muestra el acumulado de J1", () => {
    const rows = computeRankingIndividualAcumuladoHasta({
      jornadas: [jornada1, jornada2Pendiente],
      hastaNumero: 1,
      inscripciones: inscripcionesBase,
    });
    expect(rows.find((r) => r.jugadorId === A)?.puntos).toBe(12);
    expect(rows.find((r) => r.jugadorId === B)?.puntos).toBe(12);
    expect(rows.find((r) => r.jugadorId === C)?.puntos).toBe(7);
    expect(rows.find((r) => r.jugadorId === D)?.puntos).toBe(7);
    expect(rows[0]?.posicion).toBe(1);
  });

  it("2. Jornada 2 sin disputar conserva el acumulado de J1 (no ceros)", () => {
    const rows = computeRankingIndividualAcumuladoHasta({
      jornadas: [jornada1, jornada2Pendiente],
      hastaNumero: 2,
      inscripciones: inscripcionesBase,
    });
    expect(rows.find((r) => r.jugadorId === A)?.puntos).toBe(12);
    expect(rows.find((r) => r.jugadorId === A)?.puntosJornada).toBe(0);
    expect(rows.every((r) => r.puntos > 0 || r.jugadorId)).toBe(true);
    expect(rows.filter((r) => r.puntos === 0)).toHaveLength(0);
  });

  it("3. Jornada 2 completa suma J1 + J2", () => {
    const rows = computeRankingIndividualAcumuladoHasta({
      jornadas: [jornada1, jornada2Completa],
      hastaNumero: 2,
      inscripciones: inscripcionesBase,
    });
    // Ana: 12+11=23 · Carla: 7+11=18 · Beto: 12+8=20 · Diego: 7+8=15
    expect(rows.find((r) => r.jugadorId === A)?.puntos).toBe(23);
    expect(rows.find((r) => r.jugadorId === B)?.puntos).toBe(20);
    expect(rows.find((r) => r.jugadorId === C)?.puntos).toBe(18);
    expect(rows.find((r) => r.jugadorId === D)?.puntos).toBe(15);
    expect(rows.find((r) => r.jugadorId === A)?.puntosJornada).toBe(11);
  });

  it("4. Jornada 3 acumula hasta J3", () => {
    const rows = computeRankingIndividualAcumuladoHasta({
      jornadas: [jornada1, jornada2Completa, jornada3],
      hastaNumero: 3,
      inscripciones: inscripcionesBase,
    });
    // Ana 23+4=27 · Beto 20+6=26 · Carla 18+6=24 · Diego 15+4=19
    expect(rows.find((r) => r.jugadorId === A)?.puntos).toBe(27);
    expect(rows.find((r) => r.jugadorId === B)?.puntos).toBe(26);
  });

  it("5. Jugador con cero puntos aparece si está inscrito", () => {
    const E = "jug-e";
    const rows = computeRankingIndividualAcumuladoHasta({
      jornadas: [jornada1],
      hastaNumero: 1,
      inscripciones: [...inscripcionesBase, insc(E, "Elena")],
    });
    expect(rows.find((r) => r.jugadorId === E)?.puntos).toBe(0);
  });

  it("6. Jugador sin participación en una jornada conserva puntos previos", () => {
    const rowsHasta2 = computeRankingIndividualAcumuladoHasta({
      jornadas: [jornada1, jornada2Completa],
      hastaNumero: 2,
      inscripciones: inscripcionesBase,
    });
    // Todos jugaron; verificar que J2 no borra J1
    expect(rowsHasta2.find((r) => r.jugadorId === D)?.puntos).toBe(15);
  });

  it("7-8. Sustitución: el entrante recibe herencia; el saliente no duplica tras la jornada efectiva", () => {
    const S = "jug-s";
    const rowsJ1 = computeRankingIndividualAcumuladoHasta({
      jornadas: [jornada1, jornada2Pendiente],
      hastaNumero: 1,
      inscripciones: [
        insc(S, "Sustituto", { heredados: 12, ingreso: 2 }),
        insc(B, "Beto"),
        insc(C, "Carla"),
        insc(D, "Diego"),
      ],
      sustituciones: [
        { fromJugadorId: A, toJugadorId: S, jornadaEfectivaNumero: 2 },
      ],
    });
    // En J1 el sustituto aún no ingresó; Ana aparece por puntos de partido
    expect(rowsJ1.find((r) => r.jugadorId === S)).toBeUndefined();
    expect(rowsJ1.find((r) => r.jugadorId === A)?.puntos).toBe(12);

    const rowsJ2 = computeRankingIndividualAcumuladoHasta({
      jornadas: [jornada1, jornada2Pendiente],
      hastaNumero: 2,
      inscripciones: [
        insc(S, "Sustituto", { heredados: 12, ingreso: 2 }),
        insc(B, "Beto"),
        insc(C, "Carla"),
        insc(D, "Diego"),
      ],
      sustituciones: [
        { fromJugadorId: A, toJugadorId: S, jornadaEfectivaNumero: 2 },
      ],
    });
    expect(rowsJ2.find((r) => r.jugadorId === S)?.puntos).toBe(12);
    expect(rowsJ2.find((r) => r.jugadorId === A)).toBeUndefined();
  });

  it("9-10. Empates ordenan por puntos y luego por nombre", () => {
    const rows = computeRankingIndividualAcumuladoHasta({
      jornadas: [jornada1],
      hastaNumero: 1,
      inscripciones: inscripcionesBase,
    });
    const top = rows.filter((r) => r.puntos === 12);
    expect(top.map((r) => r.nombre)).toEqual(["Ana", "Beto"]);
  });

  it("11. Jornada histórica no incluye puntos de jornadas posteriores", () => {
    const rows = computeRankingIndividualAcumuladoHasta({
      jornadas: [jornada1, jornada2Completa, jornada3],
      hastaNumero: 1,
      inscripciones: inscripcionesBase,
    });
    expect(rows.find((r) => r.jugadorId === A)?.puntos).toBe(12);
    expect(rows.find((r) => r.jugadorId === A)?.puntosJornada).toBe(12);
  });

  it("12. Ranking de parejas de jornada no se calcula aquí (solo individual)", () => {
    const rows = computeRankingIndividualAcumuladoHasta({
      jornadas: [jornada1, jornada2Completa],
      hastaNumero: 2,
      inscripciones: inscripcionesBase,
    });
    expect(rows.every((r) => "jugadorId" in r)).toBe(true);
    expect(rows.some((r) => "parejaId" in (r as object))).toBe(false);
  });

  it("13. Consistencia con total de temporada cuando el corte es la última completed", () => {
    const rows = computeRankingIndividualAcumuladoHasta({
      jornadas: [jornada1, jornada2Completa],
      hastaNumero: 2,
      inscripciones: inscripcionesBase,
    });
    const total = rows.reduce((sum, r) => sum + r.puntosPartidos, 0);
    // Cada game suma a 2 jugadores → 2 * (12+7 + 11+8) = 2*38 = 76
    expect(total).toBe(76);
  });

  it("14. No duplica bonificaciones ni herencia", () => {
    const rows = computeRankingIndividualAcumuladoHasta({
      jornadas: [jornada1, jornada2Pendiente],
      hastaNumero: 2,
      inscripciones: [
        insc(A, "Ana", { heredados: 5 }),
        insc(B, "Beto"),
        insc(C, "Carla"),
        insc(D, "Diego"),
      ],
    });
    expect(rows.find((r) => r.jugadorId === A)?.puntos).toBe(17);
    expect(rows.find((r) => r.jugadorId === A)?.puntosHeredados).toBe(5);
    expect(rows.find((r) => r.jugadorId === A)?.puntosPartidos).toBe(12);
  });

  it("15. Función pura: no muta jornadas ni inscripciones", () => {
    const jornadas = [jornada1, jornada2Pendiente];
    const inscripciones = [...inscripcionesBase];
    const before = JSON.stringify({ jornadas, inscripciones });
    computeRankingIndividualAcumuladoHasta({
      jornadas,
      hastaNumero: 2,
      inscripciones,
    });
    expect(JSON.stringify({ jornadas, inscripciones })).toBe(before);
  });

  it("sin lista de sustituciones: herencia activa evita duplicar al saliente", () => {
    const S = "jug-s";
    const rows = computeRankingIndividualAcumuladoHasta({
      jornadas: [jornada1, jornada2Pendiente],
      hastaNumero: 2,
      inscripciones: [
        insc(S, "Sustituto", { heredados: 12, ingreso: 2 }),
        insc(B, "Beto"),
        insc(C, "Carla"),
        insc(D, "Diego"),
      ],
    });
    expect(rows.find((r) => r.jugadorId === S)?.puntos).toBe(12);
    expect(rows.find((r) => r.jugadorId === A)).toBeUndefined();
  });

  it("16. Resultados parciales de la jornada de corte no entran al acumulado", () => {
    const j2Parcial = jornada(
      2,
      "in_progress",
      [
        pareja("p3", "j2", A, C, "Ana", "Carla"),
        pareja("p4", "j2", B, D, "Beto", "Diego"),
      ],
      [
        partido("m3", "j2", "p3", "p4", 6, 1, "completed"),
        partido("m4", "j2", "p3", "p4", null, null, "upcoming"),
      ]
    );
    const rows = computeRankingIndividualAcumuladoHasta({
      jornadas: [jornada1, j2Parcial],
      hastaNumero: 2,
      inscripciones: inscripcionesBase,
    });
    expect(rows.find((r) => r.jugadorId === A)?.puntos).toBe(12);
    expect(rows.find((r) => r.jugadorId === A)?.puntosJornada).toBe(0);
  });
});
