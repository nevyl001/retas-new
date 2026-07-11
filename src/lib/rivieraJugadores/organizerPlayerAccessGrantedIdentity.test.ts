jest.mock("../supabaseClient", () => ({
  supabase: { auth: { getSession: jest.fn() }, rpc: jest.fn(), from: jest.fn() },
  supabasePublicRead: { from: jest.fn() },
}));

import { applyGrantedSourceDisplayToJugador } from "./organizerPlayerAccess";
import { RivieraJugadorWithStats } from "./types";

function baseJugador(
  overrides: Partial<RivieraJugadorWithStats> = {}
): RivieraJugadorWithStats {
  return {
    id: "local-clone",
    nombre: "Itsi M",
    slug: "itsi-m",
    foto_url: null,
    email: null,
    telefono: null,
    whatsapp: null,
    nivel: "intermedio",
    categoria: "6ta_fuerza",
    edad: null,
    mano_dominante: null,
    en_cancha: null,
    pais_codigo: "MX",
    instagram_url: null,
    facebook_url: null,
    tiktok_url: null,
    visible_publico: false,
    suma_ranking: true,
    genero: "F",
    fecha_nacimiento: null,
    club: null,
    organizador_id: "riviera-org",
    estado: "activo",
    legacy_player_id: null,
    legacy_liga_jugador_id: null,
    created_at: "",
    updated_at: "",
    rating: 3,
    rating_partidos: 0,
    rating_fiabilidad: 0.2,
    ...overrides,
  };
}

const sourceDisplay = {
  stats: null,
  nombre: "Itzi M",
  fotoUrl: "https://cdn.example/itzi.jpg",
  categoria: "5ta_fuerza" as const,
  nivel: "avanzado" as const,
  rating: 3.4,
  ratingPartidos: 12,
  ratingFiabilidad: 0.6,
};

describe("applyGrantedSourceDisplayToJugador identity precedence", () => {
  it("sin override: origen gana nombre, foto, categoría y nivel", () => {
    const jugador = baseJugador({
      grantedAccess: {
        accessId: "grant-1",
        sourceJugadorId: "source-1",
        ownerOrganizadorId: "hack-org",
        localDisplayName: null,
        localCategory: null,
      },
    });

    const result = applyGrantedSourceDisplayToJugador(
      jugador,
      sourceDisplay,
      "hack-org"
    );

    expect(result.nombre).toBe("Itzi M");
    expect(result.foto_url).toBe("https://cdn.example/itzi.jpg");
    expect(result.categoria).toBe("5ta_fuerza");
    expect(result.nivel).toBe("avanzado");
    expect(result.rating).toBe(3.4);
  });

  it("con local_display_name: conserva nombre local, pero foto y nivel vienen del origen", () => {
    const jugador = baseJugador({
      nombre: "Alias Local",
      grantedAccess: {
        accessId: "grant-1",
        sourceJugadorId: "source-1",
        localDisplayName: "Alias Local",
        localCategory: null,
      },
    });

    const result = applyGrantedSourceDisplayToJugador(jugador, sourceDisplay);

    expect(result.nombre).toBe("Alias Local");
    expect(result.foto_url).toBe("https://cdn.example/itzi.jpg");
    expect(result.nivel).toBe("avanzado");
  });

  it("con local_category: conserva categoría local, nombre del origen si no hay override de nombre", () => {
    const jugador = baseJugador({
      categoria: "open",
      grantedAccess: {
        accessId: "grant-1",
        sourceJugadorId: "source-1",
        localDisplayName: null,
        localCategory: "open",
      },
    });

    const result = applyGrantedSourceDisplayToJugador(jugador, sourceDisplay);

    expect(result.nombre).toBe("Itzi M");
    expect(result.categoria).toBe("open");
  });
});
