/**
 * @jest-environment jsdom
 */
import {
  assertPublicClubPlayerContextHasNoPii,
  mapPublicClubPlayerContextToJugador,
  type PublicClubPlayerContextRow,
} from "./publicClubPlayerContext";

function row(
  overrides: Partial<PublicClubPlayerContextRow> = {}
): PublicClubPlayerContextRow {
  return {
    id: "j1",
    organizador_id: "org1",
    nombre: "Ana",
    slug: "ana",
    foto_url: null,
    email: null,
    telefono: null,
    whatsapp: null,
    nivel: "intermedio",
    categoria: "open",
    edad: 30,
    mano_dominante: null,
    en_cancha: null,
    pais_codigo: null,
    instagram_url: null,
    facebook_url: null,
    tiktok_url: null,
    visible_publico: false,
    suma_ranking: true,
    genero: "F",
    fecha_nacimiento: null,
    club: null,
    estado: "activo",
    legacy_player_id: null,
    legacy_liga_jugador_id: null,
    created_at: "",
    updated_at: "",
    rating: 3,
    rating_partidos: 0,
    rating_fiabilidad: 0,
    puntos_totales: 10,
    total_partidos: 1,
    victorias: 1,
    derrotas: 0,
    empates: 0,
    participaciones_solo: 0,
    pct_victorias: 100,
    total_retas: 0,
    total_torneos_express: 0,
    total_ligas: 0,
    total_americanos: 0,
    sets_favor_total: 0,
    sets_contra_total: 0,
    racha_actual: "",
    ultima_actividad: null,
    stats_updated_at: null,
    concedido: true,
    source_jugador_id: "src1",
    owner_organizador_id: "owner1",
    ...overrides,
  };
}

describe("publicClubPlayerContext mapper", () => {
  it("mapea cedido sin PII", () => {
    const j = mapPublicClubPlayerContextToJugador(row());
    expect(j.id).toBe("j1");
    expect(j.visible_publico).toBe(false);
    expect(j.concedidoPorAdmin).toBe(true);
    expect(j.grantedAccess?.sourceJugadorId).toBe("src1");
    expect(j.email).toBeNull();
    expect(j.telefono).toBeNull();
    expect(j.whatsapp).toBeNull();
    expect(j.fecha_nacimiento).toBeNull();
  });

  it("assertPublicClubPlayerContextHasNoPii falla si hay email", () => {
    expect(() =>
      assertPublicClubPlayerContextHasNoPii({ ...row(), email: "a@b.c" as never })
    ).toThrow(/email/);
  });
});
