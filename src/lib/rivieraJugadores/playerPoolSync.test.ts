import { mergeRivieraContactIntoLegacyPlayer } from "./playerPoolSync";
import type { Player } from "../db/types";
import type { RivieraJugador } from "./types";

function legacy(
  email: string,
  emailVerified?: boolean | null
): Player & { email_verified?: boolean | null } {
  return {
    id: "p1",
    name: "Luis B",
    email,
    created_at: "",
    email_verified: emailVerified,
  };
}

function riviera(email: string | null): RivieraJugador {
  return {
    id: "r1",
    nombre: "Luis B",
    slug: "luis-b",
    foto_url: null,
    email,
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
    genero: null,
    fecha_nacimiento: null,
    club: null,
    organizador_id: "org",
    estado: "activo",
    legacy_player_id: "p1",
    legacy_liga_jugador_id: null,
    rating: 3,
    rating_partidos: 0,
    rating_fiabilidad: 0.2,
    created_at: "",
    updated_at: "",
  };
}

describe("mergeRivieraContactIntoLegacyPlayer", () => {
  it("usa email del registro y lo marca verificado aunque legacy tenga @padel.local", () => {
    const merged = mergeRivieraContactIntoLegacyPlayer(
      riviera("luis@ejemplo.com"),
      legacy("luis@padel.local", false)
    );
    expect(merged.email).toBe("luis@ejemplo.com");
    expect(merged.email_verified).toBe(true);
  });

  it("conserva email legacy verificado si riviera no trae email", () => {
    const merged = mergeRivieraContactIntoLegacyPlayer(
      riviera(null),
      legacy("memo@ejemplo.com", true)
    );
    expect(merged.email).toBe("memo@ejemplo.com");
    expect(merged.email_verified).toBe(true);
  });
});
