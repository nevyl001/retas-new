import { mergeRivieraContactIntoLegacyPlayer } from "./playerPoolSync";
import type { Player } from "../db/types";
import type { RivieraJugador } from "./types";
import * as fs from "fs";
import * as path from "path";

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
    suma_ranking: true,
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

describe("playerPoolSync — ruta PRIVATE de contacto", () => {
  it("sync legacy/liga y build pool usan listRivieraJugadoresPrivate", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "playerPoolSync.ts"),
      "utf8"
    );
    expect(src).toMatch(/listRivieraJugadoresPrivate\(organizadorId/);
    expect(src).toMatch(
      /listRivieraJugadoresPrivate\(organizadorId,\s*\{\s*skipCareerEnrich:\s*true/
    );
    // Remap liga: PRIVATE by id, no select("*") sobre riviera_jugadores.
    expect(src).toMatch(/getRivieraJugadorPrivateById\(effectiveId\)/);
    expect(src).not.toMatch(
      /from\("riviera_jugadores"\)\s*\n\s*\.select\("\*"\)/
    );
  });

  it("buildLegacyPlayersFromRivieraRegistry (pool de selección en Reta) usa skipCareerEnrich", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "playerPoolSync.ts"),
      "utf8"
    );
    const fnMatch = src.match(
      /export async function buildLegacyPlayersFromRivieraRegistry[\s\S]*?\n}\n/
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];
    // Esta función solo arma id/nombre/categoría/vínculo legacy para elegir
    // jugadores — no debe volver a pagar el fetch caro de carrera global
    // (regresión real detectada: un segundo fetch del registro sin el flag,
    // redundante con el `syncLegacyPlayersFromRivieraRegistry` de arriba).
    expect(fnBody).toMatch(
      /listRivieraJugadoresPrivate\(organizadorId,\s*\{\s*skipCareerEnrich:\s*true/
    );
    expect(fnBody).not.toMatch(/listRivieraJugadoresPrivate\(organizadorId\)/);
  });

  it("buildLegacyPlayers sanea cedidos con legacy cross-org (no los descarta)", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "playerPoolSync.ts"),
      "utf8"
    );
    const fnMatch = src.match(
      /export async function buildLegacyPlayersFromRivieraRegistry[\s\S]*?\n}\n/
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];
    // Regresión Mario/Yusuke: isGranted → return null sacaba importados del pool.
    expect(fnBody).not.toMatch(
      /else if \(isGrantedJugadorRow\(row\)\) \{\s*return null/
    );
    expect(fnBody).toMatch(/buildLegacyPlayers heal skip/);
    expect(fnBody).toMatch(/usableLocal/);
  });
});
