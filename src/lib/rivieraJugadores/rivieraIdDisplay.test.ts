import {
  applyRivieraIdToJugador,
  collectJugadorIdsForRivieraLookup,
  isValidRivieraId,
} from "./rivieraIdDisplay";
import type { RivieraJugadorWithStats } from "./types";

function baseJugador(
  overrides: Partial<RivieraJugadorWithStats> = {}
): RivieraJugadorWithStats {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    nombre: "Test",
    slug: "test",
    foto_url: null,
    email: null,
    telefono: null,
    whatsapp: null,
    nivel: "intermedio",
    categoria: "3ra_fuerza",
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
    organizador_id: "22222222-2222-2222-2222-222222222222",
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

describe("isValidRivieraId", () => {
  it("acepta formato RIV-00000001", () => {
    expect(isValidRivieraId("RIV-00000001")).toBe(true);
    expect(isValidRivieraId("RIV-00000042")).toBe(true);
  });

  it("rechaza valores inválidos o vacíos", () => {
    expect(isValidRivieraId("RIV-1")).toBe(false);
    expect(isValidRivieraId("riv-00000001")).toBe(false);
    expect(isValidRivieraId(null)).toBe(false);
    expect(isValidRivieraId(undefined)).toBe(false);
    expect(isValidRivieraId("")).toBe(false);
  });
});

describe("collectJugadorIdsForRivieraLookup", () => {
  it("incluye id local y source de grants", () => {
    const ids = collectJugadorIdsForRivieraLookup([
      baseJugador({
        id: "local-id",
        grantedAccess: {
          accessId: "access",
          sourceJugadorId: "source-id",
        },
      }),
    ]);

    expect(ids).toEqual(expect.arrayContaining(["local-id", "source-id"]));
  });
});

describe("applyRivieraIdToJugador", () => {
  it("asigna riviera_id cuando existe en el mapa", () => {
    const jugador = baseJugador();
    const map = new Map([[jugador.id, "RIV-00000007"]]);
    const enriched = applyRivieraIdToJugador(jugador, map);
    expect(enriched.riviera_id).toBe("RIV-00000007");
  });

  it("resuelve por sourceJugadorId en clones concedidos", () => {
    const jugador = baseJugador({
      id: "local-id",
      grantedAccess: {
        accessId: "access",
        sourceJugadorId: "source-id",
      },
    });
    const map = new Map([["source-id", "RIV-00000099"]]);
    const enriched = applyRivieraIdToJugador(jugador, map);
    expect(enriched.riviera_id).toBe("RIV-00000099");
  });

  it("no modifica el jugador si no hay riviera_id válido", () => {
    const jugador = baseJugador({ riviera_id: null });
    const enriched = applyRivieraIdToJugador(jugador, new Map());
    expect(enriched).toBe(jugador);
    expect(enriched.riviera_id).toBeNull();
  });
});
