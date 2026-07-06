import { bothPairsReady, type DueloPair } from "./DueloPairBuilder";
import type { RivieraJugador } from "../../lib/rivieraJugadores/types";

function jugador(id: string, nombre: string): RivieraJugador {
  return {
    id,
    nombre,
    slug: id,
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
    organizador_id: "org-1",
    estado: "activo",
    legacy_player_id: null,
    legacy_liga_jugador_id: null,
    created_at: "",
    updated_at: "",
    rating: 3,
    rating_partidos: 0,
    rating_fiabilidad: 0.2,
  };
}

function pair(a: string, b: string): DueloPair {
  return { j1: jugador(a, a), j2: jugador(b, b) };
}

describe("bothPairsReady", () => {
  it("requiere ambas parejas", () => {
    expect(bothPairsReady(null, null)).toBe(false);
    expect(bothPairsReady(pair("a", "b"), null)).toBe(false);
    expect(bothPairsReady(null, pair("c", "d"))).toBe(false);
    expect(bothPairsReady(pair("a", "b"), pair("c", "d"))).toBe(true);
  });
});
