import { rankingPosicionesFromSorted } from "./rankingPosition";
import type { RivieraJugadorWithStats } from "./types";

function j(puntos: number, id: string): RivieraJugadorWithStats {
  return {
    id,
    nombre: id,
    slug: id,
    foto_url: null,
    email: null,
    telefono: null,
    whatsapp: null,
    nivel: "intermedio",
    categoria: "5ta_fuerza",
    edad: null,
    mano_dominante: null,
    en_cancha: null,
    pais_codigo: null,
    instagram_url: null,
    facebook_url: null,
    tiktok_url: null,
    visible_publico: true,
    suma_ranking: true,
    genero: null,
    fecha_nacimiento: null,
    club: null,
    organizador_id: "org",
    estado: "activo",
    legacy_player_id: null,
    legacy_liga_jugador_id: null,
    rating: 3,
    rating_partidos: 0,
    rating_fiabilidad: 0.2,
    created_at: "",
    updated_at: "",
    stats: {
      jugador_id: id,
      total_partidos: 0,
      victorias: 0,
      derrotas: 0,
      empates: 0,
      participaciones_solo: 0,
      pct_victorias: 0,
      total_retas: 0,
      total_torneos_express: 0,
      total_ligas: 0,
      total_americanos: 0,
      sets_favor_total: 0,
      sets_contra_total: 0,
      racha_actual: "",
      ultima_actividad: null,
      puntos_totales: puntos,
      updated_at: "",
    },
  };
}

describe("rankingPosicionesFromSorted", () => {
  it("empates comparten puesto; siguiente salta (Premier Padel)", () => {
    const list = [
      j(70, "axel"),
      j(70, "nevyl"),
      j(20, "alan"),
      j(20, "edgardo"),
      j(20, "eduardo"),
      j(20, "isra"),
      j(0, "enrique"),
      j(0, "irving"),
      j(0, "ricardo"),
      j(0, "rodolfo"),
    ];
    expect(rankingPosicionesFromSorted(list)).toEqual([
      1, 1, 3, 3, 3, 3, 7, 7, 7, 7,
    ]);
  });

  it("empates en puesto 6: ambos #6 y el siguiente #8", () => {
    const list = [
      j(550, "diego"),
      j(400, "carlos"),
      j(400, "enrique"),
      j(250, "paco"),
      j(220, "axel"),
      j(200, "luis"),
      j(200, "memo"),
      j(150, "carlos-co"),
    ];
    expect(rankingPosicionesFromSorted(list)).toEqual([
      1, 2, 2, 4, 5, 6, 6, 8,
    ]);
  });
});
