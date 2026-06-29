import type { LigaEquipo, LigaJornada, LigaJornadaPareja } from "./types";
import {
  formatEquipoNombre,
  formatJornadaParejaNombre,
  listJornadaPublicMatches,
} from "./publicDisplay";

describe("publicDisplay", () => {
  const equipos: LigaEquipo[] = [
    {
      id: "eq1",
      liga_id: "l1",
      nombre: "Alpha / Beta",
      jugador1_id: "j1",
      jugador2_id: "j2",
      puntos: 0,
      partidos_jugados: 0,
      partidos_ganados: 0,
      partidos_perdidos: 0,
      games_favor: 0,
      games_contra: 0,
      diferencia_games: 0,
      created_at: "",
    },
  ];

  it("formatea nombre de equipo", () => {
    expect(formatEquipoNombre(equipos[0])).toBe("Alpha / Beta");
  });

  it("muestra desglose por sets en parejas fijas", () => {
    const pareja1: LigaJornadaPareja = {
      id: "p1",
      jornada_id: "j1",
      jugador1_id: "j1",
      jugador2_id: "j2",
      equipo_id: "eq1",
    };
    const pareja2: LigaJornadaPareja = {
      id: "p2",
      jornada_id: "j1",
      jugador1_id: "j3",
      jugador2_id: "j4",
      jugador1: { id: "j3", nombre: "Gamma", email: null, telefono: null, genero: null, nivel: null, estado: "activo", organizador_id: null, created_at: "" },
      jugador2: { id: "j4", nombre: "Delta", email: null, telefono: null, genero: null, nivel: null, estado: "activo", organizador_id: null, created_at: "" },
    };
    const jornada: LigaJornada = {
      id: "j1",
      liga_id: "l1",
      numero: 1,
      estado: "upcoming",
      fecha: null,
      created_at: "",
      puntos_aplicados: false,
      parejas: [pareja1, pareja2],
      partidos: [
        {
          id: "m1",
          jornada_id: "j1",
          pareja1_id: "p1",
          pareja2_id: "p2",
          score_pareja1: 20,
          score_pareja2: 18,
          set_scores: {
            sets: [
              { p1: 6, p2: 4, kind: "regular" },
              { p1: 4, p2: 6, kind: "regular" },
              { p1: 10, p2: 8, kind: "super_tiebreak" },
            ],
          },
          cancha: 1,
          ronda: 1,
          estado: "completed",
          created_at: "",
        },
      ],
    };

    const rows = listJornadaPublicMatches(jornada, equipos, true);
    expect(rows[0].score).toBe("6-4, 4-6, 10-8 (STB)");
  });

  it("lista enfrentamientos en parejas fijas", () => {
    const pareja1: LigaJornadaPareja = {
      id: "p1",
      jornada_id: "j1",
      jugador1_id: "j1",
      jugador2_id: "j2",
      equipo_id: "eq1",
    };
    const pareja2: LigaJornadaPareja = {
      id: "p2",
      jornada_id: "j1",
      jugador1_id: "j3",
      jugador2_id: "j4",
      jugador1: { id: "j3", nombre: "Gamma", email: null, telefono: null, genero: null, nivel: null, estado: "activo", organizador_id: null, created_at: "" },
      jugador2: { id: "j4", nombre: "Delta", email: null, telefono: null, genero: null, nivel: null, estado: "activo", organizador_id: null, created_at: "" },
    };
    const jornada: LigaJornada = {
      id: "j1",
      liga_id: "l1",
      numero: 1,
      estado: "upcoming",
      fecha: null,
      created_at: "",
      puntos_aplicados: false,
      parejas: [pareja1, pareja2],
      partidos: [
        {
          id: "m1",
          jornada_id: "j1",
          pareja1_id: "p1",
          pareja2_id: "p2",
          score_pareja1: 6,
          score_pareja2: 4,
          cancha: 1,
          ronda: 1,
          estado: "completed",
          created_at: "",
        },
      ],
    };

    const rows = listJornadaPublicMatches(jornada, equipos, true);
    expect(rows).toHaveLength(1);
    expect(rows[0].local).toBe("Alpha / Beta");
    expect(rows[0].visitante).toBe("Gamma / Delta");
    expect(rows[0].score).toBe("6 – 4");
  });

  it("usa nombres de jugadores si no hay equipo", () => {
    const pareja: LigaJornadaPareja = {
      id: "p1",
      jornada_id: "j1",
      jugador1_id: "j1",
      jugador2_id: "j2",
      jugador1: { id: "j1", nombre: "Ana", email: null, telefono: null, genero: null, nivel: null, estado: "activo", organizador_id: null, created_at: "" },
      jugador2: { id: "j2", nombre: "Bea", email: null, telefono: null, genero: null, nivel: null, estado: "activo", organizador_id: null, created_at: "" },
    };
    expect(formatJornadaParejaNombre(pareja)).toBe("Ana / Bea");
  });
});
