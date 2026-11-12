import type { LigaJornada } from "../liga/types";
import { buildLigaJornadaPartidosDetalleByJugadorId } from "./buildLigaJornadaPartidosDetalle";

const jornada: LigaJornada = {
  id: "j1",
  liga_id: "liga1",
  numero: 2,
  estado: "completed",
  fecha: "2026-06-01",
  created_at: "2026-06-01T10:00:00Z",
  parejas: [
    {
      id: "par1",
      jornada_id: "j1",
      jugador1_id: "j1",
      jugador2_id: "j2",
      jugador1: {
        id: "j1",
        nombre: "Luis",
        email: null,
        telefono: null,
        genero: null,
        nivel: null,
        estado: "activo",
        organizador_id: null,
        created_at: "2026-06-01T10:00:00Z",
      },
      jugador2: {
        id: "j2",
        nombre: "María",
        email: null,
        telefono: null,
        genero: null,
        nivel: null,
        estado: "activo",
        organizador_id: null,
        created_at: "2026-06-01T10:00:00Z",
      },
    },
    {
      id: "par2",
      jornada_id: "j1",
      jugador1_id: "j3",
      jugador2_id: "j4",
      jugador1: {
        id: "j3",
        nombre: "Pedro",
        email: null,
        telefono: null,
        genero: null,
        nivel: null,
        estado: "activo",
        organizador_id: null,
        created_at: "2026-06-01T10:00:00Z",
      },
      jugador2: {
        id: "j4",
        nombre: "Sofía",
        email: null,
        telefono: null,
        genero: null,
        nivel: null,
        estado: "activo",
        organizador_id: null,
        created_at: "2026-06-01T10:00:00Z",
      },
    },
  ],
  partidos: [
    {
      id: "lp1",
      jornada_id: "j1",
      pareja1_id: "par1",
      pareja2_id: "par2",
      score_pareja1: 6,
      score_pareja2: 4,
      cancha: 1,
      estado: "completed",
      ronda: 1,
      created_at: "2026-06-01T12:00:00Z",
    },
  ],
};

describe("buildLigaJornadaPartidosDetalle", () => {
  it("genera detalle por jugador de la jornada", () => {
    const byJugador = buildLigaJornadaPartidosDetalleByJugadorId(jornada);
    const detalle = byJugador.get("j1");
    expect(detalle).toHaveLength(1);
    expect(detalle![0]).toMatchObject({
      fase: "Jornada 2",
      rival: "Pedro / Sofía",
      games_favor: 6,
      games_contra: 4,
      resultado: "win",
    });
    expect(byJugador.get("j3")![0].resultado).toBe("loss");
  });

  it("usa los sets oficiales cuando suman más juegos del lado que perdió", () => {
    const byJugador = buildLigaJornadaPartidosDetalleByJugadorId({
      ...jornada,
      partidos: [
        {
          ...jornada.partidos![0]!,
          score_pareja1: 14,
          score_pareja2: 12,
          set_scores: {
            sets: [
              { p1: 6, p2: 0, kind: "regular" },
              { p1: 4, p2: 6, kind: "regular" },
              { p1: 4, p2: 6, kind: "regular" },
            ],
          },
        },
      ],
    });
    expect(byJugador.get("j1")![0]).toMatchObject({
      games_favor: 14,
      games_contra: 12,
      resultado: "loss",
    });
    expect(byJugador.get("j3")![0].resultado).toBe("win");
  });

  it("conserva el empate de liga individual cuando no hay sets", () => {
    const byJugador = buildLigaJornadaPartidosDetalleByJugadorId({
      ...jornada,
      partidos: [
        {
          ...jornada.partidos![0]!,
          score_pareja1: 6,
          score_pareja2: 6,
        },
      ],
    });
    expect(byJugador.get("j1")![0].resultado).toBe("draw");
    expect(byJugador.get("j3")![0].resultado).toBe("draw");
  });

  it("el súper tie-break oficial gana aunque el otro lado sume más juegos", () => {
    const byJugador = buildLigaJornadaPartidosDetalleByJugadorId({
      ...jornada,
      partidos: [
        {
          ...jornada.partidos![0]!,
          score_pareja1: 10,
          score_pareja2: 9,
          set_scores: {
            format: "parejas_fijas_playoffs",
            sets: [
              { p1: 4, p2: 6 },
              { p1: 6, p2: 3 },
            ],
            stb: { p1: 4, p2: 10 },
            wo: false,
          },
        },
      ],
    });
    expect(byJugador.get("j1")![0]).toMatchObject({
      games_favor: 10,
      games_contra: 9,
      resultado: "loss",
    });
    expect(byJugador.get("j3")![0].resultado).toBe("win");
  });

  it("un tie-break de 5 puntos decide el playoff aunque el marcador sea 9 a 7", () => {
    const byJugador = buildLigaJornadaPartidosDetalleByJugadorId({
      ...jornada,
      partidos: [
        {
          ...jornada.partidos![0]!,
          score_pareja1: 9,
          score_pareja2: 7,
          set_scores: {
            format: "parejas_fijas_playoffs",
            sets: [
              { p1: 3, p2: 6 },
              { p1: 6, p2: 1 },
            ],
            stb: { p1: 3, p2: 5 },
            wo: false,
          },
        },
      ],
    });
    expect(byJugador.get("j1")![0]).toMatchObject({
      games_favor: 9,
      games_contra: 7,
      resultado: "loss",
    });
    expect(byJugador.get("j3")![0].resultado).toBe("win");
  });

  it("no inventa un ganador si el playoff queda 1-1 sin desempate", () => {
    const byJugador = buildLigaJornadaPartidosDetalleByJugadorId({
      ...jornada,
      partidos: [
        {
          ...jornada.partidos![0]!,
          score_pareja1: 10,
          score_pareja2: 8,
          set_scores: {
            format: "parejas_fijas_playoffs",
            sets: [
              { p1: 4, p2: 6 },
              { p1: 6, p2: 2 },
            ],
            stb: null,
            wo: false,
          },
        },
      ],
    });
    expect(byJugador.get("j1")).toEqual([]);
    expect(byJugador.get("j3")).toEqual([]);
  });
});
