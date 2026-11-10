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
  opts: {
    puntos: number;
    heredados?: number;
    ingreso?: number | null;
    ajuste?: string | null;
    ajusteAt?: string | null;
  }
): LigaInscripcion {
  return {
    id: `insc-${jugadorId}`,
    liga_id: "liga-1",
    jugador_id: jugadorId,
    puntos: opts.puntos,
    puntos_heredados: opts.heredados ?? 0,
    ingreso_jornada_numero: opts.ingreso ?? null,
    puntos_ajuste_motivo: opts.ajuste ?? null,
    puntos_ajuste_at: opts.ajusteAt ?? null,
    jugador: jugador(jugadorId, nombre),
  };
}

const A = "jug-a";
const B = "jug-b";
const C = "jug-c";
const D = "jug-d";
const E = "jug-e"; // Eduardo-like

describe("computeRankingIndividualAcumuladoHasta — ajustes oficiales", () => {
  const j1Parejas = [
    pareja("p1", "j1", A, B, "Ana", "Beto"),
    pareja("p2", "j1", C, D, "Carla", "Diego"),
  ];
  const j1Partidos = [
    partido("m1", "j1", "p1", "p2", 6, 3),
    partido("m2", "j1", "p1", "p2", 6, 4),
  ];
  // Ana/Beto 12 · Carla/Diego 7
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
  // J2: Ana/Carla 11 · Beto/Diego 8 → Ana 23, Beto 20, Carla 18, Diego 15

  it("1. jugador sin ajustes: insc.puntos = partidos en el corte vigente", () => {
    const rows = computeRankingIndividualAcumuladoHasta({
      jornadas: [jornada1, jornada2Pendiente],
      hastaNumero: 2,
      inscripciones: [
        insc(A, "Ana", { puntos: 12 }),
        insc(B, "Beto", { puntos: 12 }),
        insc(C, "Carla", { puntos: 7 }),
        insc(D, "Diego", { puntos: 7 }),
      ],
    });
    expect(rows.find((r) => r.jugadorId === A)?.puntos).toBe(12);
    expect(rows.find((r) => r.jugadorId === A)?.puntosAjuste).toBe(0);
    expect(rows.find((r) => r.jugadorId === A)?.puntosAjusteMotivo).toBeNull();
  });

  it("2. penalización por inasistencia: usa insc.puntos oficiales (Eduardo L)", () => {
    const eduardoJ1 = jornada(
      1,
      "completed",
      [
        pareja("pe1", "j1", E, A, "Eduardo L", "Ana"),
        pareja("pe2", "j1", B, C, "Beto", "Carla"),
      ],
      [
        partido("me1", "j1", "pe1", "pe2", 6, 2),
        partido("me2", "j1", "pe1", "pe2", 6, 3),
        partido("me3", "j1", "pe1", "pe2", 6, 4),
        partido("me4", "j1", "pe1", "pe2", 6, 2),
        partido("me5", "j1", "pe1", "pe2", 5, 6),
      ]
    );
    // Eduardo games: 6+6+6+6+5 = 29 brutos; oficial con INASISTENCIA = 14
    const j2 = jornada(
      2,
      "upcoming",
      [
        pareja("pe3", "j2", E, B, "Eduardo L", "Beto"),
        pareja("pe4", "j2", A, C, "Ana", "Carla"),
      ],
      [partido("me6", "j2", "pe3", "pe4", null, null, "upcoming")]
    );
    const inscs = [
      insc(E, "Eduardo L", {
        puntos: 14,
        ajuste: "INASISTENCIA",
        ajusteAt: "2026-11-01T12:00:00Z",
      }),
      insc(A, "Ana", { puntos: 29 }),
      insc(B, "Beto", { puntos: 17 }),
      insc(C, "Carla", { puntos: 17 }),
    ];
    const rowsJ1 = computeRankingIndividualAcumuladoHasta({
      jornadas: [eduardoJ1, j2],
      hastaNumero: 1,
      inscripciones: inscs,
    });
    const eduJ1 = rowsJ1.find((r) => r.jugadorId === E)!;
    expect(eduJ1.puntosPartidos).toBe(29);
    expect(eduJ1.puntos).toBe(14);
    expect(eduJ1.puntosAjuste).toBe(-15);
    expect(eduJ1.puntosAjusteMotivo).toBe("INASISTENCIA");
    expect(eduJ1.posicion).not.toBe(1);

    const rowsJ2 = computeRankingIndividualAcumuladoHasta({
      jornadas: [eduardoJ1, j2],
      hastaNumero: 2,
      inscripciones: inscs,
    });
    const eduJ2 = rowsJ2.find((r) => r.jugadorId === E)!;
    expect(eduJ2.puntos).toBe(14);
    expect(rowsJ2[0]?.jugadorId).not.toBe(E);
  });

  it("3. bonificación oficial: insc.puntos por encima de partidos", () => {
    const rows = computeRankingIndividualAcumuladoHasta({
      jornadas: [jornada1],
      hastaNumero: 1,
      inscripciones: [
        insc(A, "Ana", { puntos: 15, ajuste: "BONIFICACIÓN" }),
        insc(B, "Beto", { puntos: 12 }),
        insc(C, "Carla", { puntos: 7 }),
        insc(D, "Diego", { puntos: 7 }),
      ],
    });
    expect(rows.find((r) => r.jugadorId === A)?.puntos).toBe(15);
    expect(rows.find((r) => r.jugadorId === A)?.puntosAjuste).toBe(3);
    expect(rows[0]?.jugadorId).toBe(A);
  });

  it("4. ajuste administrativo absoluto sin inventar delta en cortes históricos posteriores", () => {
    // J1+J2 completed. Ajuste vigente en inscripción = 20 (sobre 23 de partidos).
    // Corte histórico J1: no se inventa el ajuste (ledger sin jornada).
    const inscs = [
      insc(A, "Ana", { puntos: 20, ajuste: "AJUSTE ADMIN" }),
      insc(B, "Beto", { puntos: 20 }),
      insc(C, "Carla", { puntos: 18 }),
      insc(D, "Diego", { puntos: 15 }),
    ];
    const hist = computeRankingIndividualAcumuladoHasta({
      jornadas: [jornada1, jornada2Completa],
      hastaNumero: 1,
      inscripciones: inscs,
    });
    expect(hist.find((r) => r.jugadorId === A)?.puntos).toBe(12);
    expect(hist.find((r) => r.jugadorId === A)?.puntosAjusteMotivo).toBeNull();

    const vigente = computeRankingIndividualAcumuladoHasta({
      jornadas: [jornada1, jornada2Completa],
      hastaNumero: 2,
      inscripciones: inscs,
    });
    expect(vigente.find((r) => r.jugadorId === A)?.puntos).toBe(20);
    expect(vigente.find((r) => r.jugadorId === A)?.puntosAjuste).toBe(-3);
    expect(vigente.find((r) => r.jugadorId === A)?.puntosAjusteMotivo).toBe(
      "AJUSTE ADMIN"
    );
  });

  it("5. sustitución con puntos heredados en el corte vigente", () => {
    const S = "jug-s";
    const rows = computeRankingIndividualAcumuladoHasta({
      jornadas: [jornada1, jornada2Pendiente],
      hastaNumero: 2,
      inscripciones: [
        insc(S, "Sustituto", { puntos: 12, heredados: 12, ingreso: 2 }),
        insc(B, "Beto", { puntos: 12 }),
        insc(C, "Carla", { puntos: 7 }),
        insc(D, "Diego", { puntos: 7 }),
      ],
      sustituciones: [
        { fromJugadorId: A, toJugadorId: S, jornadaEfectivaNumero: 2 },
      ],
    });
    expect(rows.find((r) => r.jugadorId === S)?.puntos).toBe(12);
    expect(rows.find((r) => r.jugadorId === A)).toBeUndefined();
  });

  it("6. ajuste vigente en corte que ya incluye la única jornada completed", () => {
    const rows = computeRankingIndividualAcumuladoHasta({
      jornadas: [jornada1, jornada2Pendiente],
      hastaNumero: 1,
      inscripciones: [
        insc(A, "Ana", { puntos: 10, ajuste: "INASISTENCIA" }),
        insc(B, "Beto", { puntos: 12 }),
        insc(C, "Carla", { puntos: 7 }),
        insc(D, "Diego", { puntos: 7 }),
      ],
    });
    expect(rows.find((r) => r.jugadorId === A)?.puntos).toBe(10);
  });

  it("7. ajuste no se aplica retroactivamente si hay completed posteriores (sin jornada en ledger)", () => {
    const rows = computeRankingIndividualAcumuladoHasta({
      jornadas: [jornada1, jornada2Completa],
      hastaNumero: 1,
      inscripciones: [
        insc(A, "Ana", { puntos: 5, ajuste: "PENALIZACIÓN TARDÍA" }),
        insc(B, "Beto", { puntos: 20 }),
        insc(C, "Carla", { puntos: 18 }),
        insc(D, "Diego", { puntos: 15 }),
      ],
    });
    // Histórico J1: solo partidos (12), sin inventar el ajuste actual
    expect(rows.find((r) => r.jugadorId === A)?.puntos).toBe(12);
  });

  it("8. jornada pendiente conserva total oficial del corte vigente", () => {
    const rows = computeRankingIndividualAcumuladoHasta({
      jornadas: [jornada1, jornada2Pendiente],
      hastaNumero: 2,
      inscripciones: [
        insc(A, "Ana", { puntos: 12 }),
        insc(B, "Beto", { puntos: 12 }),
        insc(C, "Carla", { puntos: 7 }),
        insc(D, "Diego", { puntos: 7 }),
      ],
    });
    expect(rows.find((r) => r.jugadorId === A)?.puntosJornada).toBe(0);
    expect(rows.find((r) => r.jugadorId === A)?.puntos).toBe(12);
  });

  it("9. jornada completada suma partidos y respeta insc.puntos del corte", () => {
    const rows = computeRankingIndividualAcumuladoHasta({
      jornadas: [jornada1, jornada2Completa],
      hastaNumero: 2,
      inscripciones: [
        insc(A, "Ana", { puntos: 23 }),
        insc(B, "Beto", { puntos: 20 }),
        insc(C, "Carla", { puntos: 18 }),
        insc(D, "Diego", { puntos: 15 }),
      ],
    });
    expect(rows.find((r) => r.jugadorId === A)?.puntosPartidos).toBe(23);
    expect(rows.find((r) => r.jugadorId === A)?.puntos).toBe(23);
    expect(rows.find((r) => r.jugadorId === A)?.puntosJornada).toBe(11);
  });

  it("10. posiciones siguen puntos oficiales (penalizado no lidera)", () => {
    const rows = computeRankingIndividualAcumuladoHasta({
      jornadas: [jornada1],
      hastaNumero: 1,
      inscripciones: [
        insc(A, "Ana", { puntos: 5, ajuste: "INASISTENCIA" }),
        insc(B, "Beto", { puntos: 12 }),
        insc(C, "Carla", { puntos: 7 }),
        insc(D, "Diego", { puntos: 7 }),
      ],
    });
    expect(rows[0]?.jugadorId).toBe(B);
    expect(rows.find((r) => r.jugadorId === A)?.posicion).toBeGreaterThan(1);
  });

  it("11. no duplica herencia ni ajuste", () => {
    const rows = computeRankingIndividualAcumuladoHasta({
      jornadas: [jornada1, jornada2Pendiente],
      hastaNumero: 2,
      inscripciones: [
        insc(A, "Ana", {
          puntos: 15,
          heredados: 5,
          ajuste: "BONO",
        }),
        insc(B, "Beto", { puntos: 12 }),
        insc(C, "Carla", { puntos: 7 }),
        insc(D, "Diego", { puntos: 7 }),
      ],
    });
    const ana = rows.find((r) => r.jugadorId === A)!;
    expect(ana.puntosPartidos).toBe(12);
    expect(ana.puntosHeredados).toBe(5);
    expect(ana.puntos).toBe(15);
    expect(ana.puntosAjuste).toBe(-2); // 15 - (12+5)
  });

  it("12. coherencia con ranking general al mismo corte (insc.puntos)", () => {
    const inscs = [
      insc(A, "Ana", { puntos: 14, ajuste: "INASISTENCIA" }),
      insc(B, "Beto", { puntos: 12 }),
      insc(C, "Carla", { puntos: 7 }),
      insc(D, "Diego", { puntos: 7 }),
    ];
    const rows = computeRankingIndividualAcumuladoHasta({
      jornadas: [jornada1, jornada2Pendiente],
      hastaNumero: 2,
      inscripciones: inscs,
    });
    for (const row of rows) {
      const oficial = inscs.find((i) => i.jugador_id === row.jugadorId)!;
      expect(row.puntos).toBe(oficial.puntos);
    }
  });

  it("insc.puntos desfasado sin motivo sigue el total oficial (coherencia getRanking)", () => {
    const rows = computeRankingIndividualAcumuladoHasta({
      jornadas: [jornada1, jornada2Pendiente],
      hastaNumero: 2,
      inscripciones: [
        insc(A, "Ana", { puntos: 12 }),
        insc(B, "Beto", { puntos: 12 }),
        insc(C, "Carla", { puntos: 7 }),
        insc(D, "Diego", { puntos: 5 }),
      ],
    });
    expect(rows.find((r) => r.jugadorId === D)?.puntosPartidos).toBe(7);
    expect(rows.find((r) => r.jugadorId === D)?.puntos).toBe(5);
  });
});
