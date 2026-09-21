import {
  aggregateJugadorSeasonSupportStats,
  hasMeaningfulSupportStats,
} from "./jugadorSeasonSupportStats";
import type { LigaJornada, LigaJornadaPareja, LigaPartido } from "./types";

function pareja(
  id: string,
  j1: string,
  j2: string,
  n1: string,
  n2: string
): LigaJornadaPareja {
  return {
    id,
    jornada_id: "j1",
    jugador1_id: j1,
    jugador2_id: j2,
    jugador1: {
      id: j1,
      nombre: n1,
      email: null,
      telefono: null,
      genero: "M",
      nivel: null,
      estado: "activo",
      organizador_id: null,
      created_at: "",
    },
    jugador2: {
      id: j2,
      nombre: n2,
      email: null,
      telefono: null,
      genero: "M",
      nivel: null,
      estado: "activo",
      organizador_id: null,
      created_at: "",
    },
  };
}

function partido(
  id: string,
  p1: string,
  p2: string,
  s1: number,
  s2: number
): LigaPartido {
  return {
    id,
    jornada_id: "j1",
    pareja1_id: p1,
    pareja2_id: p2,
    score_pareja1: s1,
    score_pareja2: s2,
    cancha: 1,
    ronda: 1,
    estado: "completed",
    created_at: "",
  };
}

describe("aggregateJugadorSeasonSupportStats", () => {
  it("suma V/D/games por jugador a través de parejas rotativas en jornadas completed", () => {
    const j1: LigaJornada = {
      id: "j1",
      liga_id: "liga",
      numero: 1,
      estado: "completed",
      fecha: null,
      created_at: "",
      parejas: [
        pareja("pa", "a", "b", "A", "B"),
        pareja("pb", "c", "d", "C", "D"),
      ],
      partidos: [partido("m1", "pa", "pb", 6, 3)],
    };
    const j2: LigaJornada = {
      id: "j2",
      liga_id: "liga",
      numero: 2,
      estado: "completed",
      fecha: null,
      created_at: "",
      parejas: [
        pareja("pc", "a", "c", "A", "C"),
        pareja("pd", "b", "d", "B", "D"),
      ],
      partidos: [partido("m2", "pc", "pd", 4, 6)],
    };
    const upcoming: LigaJornada = {
      id: "j3",
      liga_id: "liga",
      numero: 3,
      estado: "upcoming",
      fecha: null,
      created_at: "",
      parejas: [
        pareja("pe", "a", "d", "A", "D"),
        pareja("pf", "b", "c", "B", "C"),
      ],
      partidos: [partido("m3", "pe", "pf", 6, 0)],
    };

    const map = aggregateJugadorSeasonSupportStats([j1, j2, upcoming]);
    const a = map.get("a")!;
    // J1 gana con B (V+1, GF+6, GC+3); J2 pierde con C (D+1, GF+4, GC+6)
    expect(a.victorias).toBe(1);
    expect(a.derrotas).toBe(1);
    expect(a.games_favor).toBe(10);
    expect(a.games_contra).toBe(9);
    expect(a.diferencia_games).toBe(1);
    // Upcoming no cuenta
    expect(a.victorias + a.derrotas).toBe(2);
  });

  it("ignora jornadas upcoming/in_progress y no lanza con datos vacíos", () => {
    expect(aggregateJugadorSeasonSupportStats(null).size).toBe(0);
    expect(aggregateJugadorSeasonSupportStats([]).size).toBe(0);
    const map = aggregateJugadorSeasonSupportStats([
      {
        id: "x",
        liga_id: "l",
        numero: 1,
        estado: "in_progress",
        fecha: null,
        created_at: "",
        parejas: [],
        partidos: [],
      },
    ]);
    expect(map.size).toBe(0);
  });

  it("hasMeaningfulSupportStats requiere partidos o games", () => {
    expect(hasMeaningfulSupportStats(undefined)).toBe(false);
    expect(
      hasMeaningfulSupportStats({
        victorias: 0,
        derrotas: 0,
        empates: 0,
        games_favor: 0,
        games_contra: 0,
        diferencia_games: 0,
      })
    ).toBe(false);
    expect(
      hasMeaningfulSupportStats({
        victorias: 1,
        derrotas: 0,
        empates: 0,
        games_favor: 6,
        games_contra: 3,
        diferencia_games: 3,
      })
    ).toBe(true);
  });
});
