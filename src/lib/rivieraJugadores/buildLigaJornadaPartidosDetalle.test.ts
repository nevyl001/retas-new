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
});
