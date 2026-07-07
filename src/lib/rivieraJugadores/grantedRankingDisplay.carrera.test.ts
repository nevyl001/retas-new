import {
  rankingPuntosCarreraRivieraDisplay,
  rankingPuntosGlobalDisplay,
} from "./grantedRankingDisplay";
import type { RivieraJugadorWithStats } from "./types";

function j(
  partial: Partial<RivieraJugadorWithStats> & { stats?: { puntos_totales: number } | null }
): RivieraJugadorWithStats {
  return {
    id: "local-clone",
    nombre: "Test",
    slug: "test",
    foto_url: null,
    email: null,
    telefono: null,
    whatsapp: null,
    nivel: "intermedio",
    categoria: "open",
    edad: null,
    mano_dominante: null,
    en_cancha: null,
    pais_codigo: null,
    instagram_url: null,
    facebook_url: null,
    tiktok_url: null,
    visible_publico: false,
    suma_ranking: true,
    genero: "M",
    fecha_nacimiento: null,
    club: null,
    organizador_id: "hack-id",
    estado: "activo",
    legacy_player_id: null,
    legacy_liga_jugador_id: null,
    created_at: "",
    updated_at: "",
    rating: 3,
    rating_partidos: 0,
    rating_fiabilidad: 0.2,
    concedidoPorAdmin: true,
    grantedAccess: {
      accessId: "g1",
      sourceJugadorId: "src-1",
      ownerOrganizadorId: "riviera-id",
    },
    statsOrigenConcedido: {
      jugador_id: "src-1",
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
      puntos_totales: 0,
      updated_at: "",
    },
    stats: {
      jugador_id: "local-clone",
      total_partidos: 1,
      victorias: 0,
      derrotas: 1,
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
      puntos_totales: 20,
      updated_at: "",
    },
    ...partial,
  };
}

describe("rankingPuntosCarreraRivieraDisplay", () => {
  it("sin ledger ROMC devuelve null (no estimar con local)", () => {
    expect(rankingPuntosCarreraRivieraDisplay(j({}))).toBeNull();
  });

  it("prioriza officialPuntosGlobal del ledger ROMC", () => {
    expect(
      rankingPuntosCarreraRivieraDisplay(j({ officialPuntosGlobal: 35 }))
    ).toBe(35);
  });

  it("rankingPuntosGlobalDisplay coincide con ledger ROMC", () => {
    expect(rankingPuntosGlobalDisplay(j({ officialPuntosGlobal: 35 }))).toBe(35);
    expect(rankingPuntosGlobalDisplay(j({}))).toBeNull();
  });
});
