import { resolveOrigenConcedidoOrganizadorId } from "./grantedRankingDisplay";
import type { RivieraJugadorWithStats } from "./types";

function j(partial: Partial<RivieraJugadorWithStats>): RivieraJugadorWithStats {
  return {
    id: "local-1",
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
    organizador_id: "club-test",
    estado: "activo",
    legacy_player_id: null,
    legacy_liga_jugador_id: null,
    created_at: "",
    updated_at: "",
    rating: 3,
    rating_partidos: 0,
    rating_fiabilidad: 0.2,
    stats: null,
    ...partial,
  };
}

describe("resolveOrigenConcedidoOrganizadorId", () => {
  it("usa ownerOrganizadorId del grant cuando existe", () => {
    const row = j({
      concedidoPorAdmin: true,
      grantedAccess: {
        accessId: "g1",
        sourceJugadorId: "src-1",
        ownerOrganizadorId: "hack-id",
      },
    });
    expect(resolveOrigenConcedidoOrganizadorId(row)).toBe("hack-id");
  });

  it("fallback al organizador_id del registro origen sin clon local", () => {
    const row = j({
      id: "src-1",
      organizador_id: "hack-id",
      concedidoPorAdmin: true,
      grantedAccess: {
        accessId: "g1",
        sourceJugadorId: "src-1",
      },
    });
    expect(resolveOrigenConcedidoOrganizadorId(row)).toBe("hack-id");
  });

  it("no usa organizador_id del clon local como origen", () => {
    const row = j({
      id: "local-clone",
      organizador_id: "club-test",
      concedidoPorAdmin: true,
      grantedAccess: {
        accessId: "g1",
        sourceJugadorId: "src-1",
      },
    });
    expect(resolveOrigenConcedidoOrganizadorId(row)).toBeNull();
  });
});
