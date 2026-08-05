import { resolvePersistedDueloPairs } from "./dueloPairSlots";
import type { Duelo2v2 } from "./types";

/**
 * Estado real del duelo "Puntos Ranking" (2026-08-05): la convocatoria llenó
 * los 4 slots y el estado seguía en `configuracion`, pero "Iniciar juego"
 * estaba deshabilitado porque solo se miraba el borrador local.
 */
function duelo(overrides: Partial<Duelo2v2> = {}): Duelo2v2 {
  return {
    pareja_a_j1_id: "j-nevyl",
    pareja_a_j2_id: "j-axel",
    pareja_a_j1_nombre: "Nevyl",
    pareja_a_j2_nombre: "Axel A",
    pareja_b_j1_id: "j-angel",
    pareja_b_j2_id: "j-luis",
    pareja_b_j1_nombre: "Ángel de Jesús",
    pareja_b_j2_nombre: "Luis Miguel",
    ...overrides,
  } as Duelo2v2;
}

describe("resolvePersistedDueloPairs", () => {
  it("devuelve los 8 campos cuando la convocatoria ya llenó los slots", () => {
    expect(resolvePersistedDueloPairs(duelo())).toEqual({
      pareja_a_j1_id: "j-nevyl",
      pareja_a_j2_id: "j-axel",
      pareja_a_j1_nombre: "Nevyl",
      pareja_a_j2_nombre: "Axel A",
      pareja_b_j1_id: "j-angel",
      pareja_b_j2_id: "j-luis",
      pareja_b_j1_nombre: "Ángel de Jesús",
      pareja_b_j2_nombre: "Luis Miguel",
    });
  });

  it("recorta espacios en ids y nombres", () => {
    const resolved = resolvePersistedDueloPairs(
      duelo({ pareja_a_j1_id: "  j-nevyl  ", pareja_a_j1_nombre: "  Nevyl  " })
    );
    expect(resolved?.pareja_a_j1_id).toBe("j-nevyl");
    expect(resolved?.pareja_a_j1_nombre).toBe("Nevyl");
  });

  it("devuelve null si falta cualquier id", () => {
    expect(resolvePersistedDueloPairs(duelo({ pareja_b_j2_id: null }))).toBeNull();
    expect(resolvePersistedDueloPairs(duelo({ pareja_a_j1_id: "   " }))).toBeNull();
  });

  it("devuelve null si falta cualquier nombre", () => {
    expect(
      resolvePersistedDueloPairs(duelo({ pareja_b_j1_nombre: "" }))
    ).toBeNull();
  });

  it("devuelve null si un jugador se repite (startDuelo2v2 lo rechazaría)", () => {
    expect(
      resolvePersistedDueloPairs(duelo({ pareja_b_j2_id: "j-nevyl" }))
    ).toBeNull();
  });

  it("devuelve null para un duelo recién creado sin parejas", () => {
    expect(
      resolvePersistedDueloPairs({
        pareja_a_j1_id: null,
        pareja_a_j2_id: null,
        pareja_a_j1_nombre: "",
        pareja_a_j2_nombre: "",
        pareja_b_j1_id: null,
        pareja_b_j2_id: null,
        pareja_b_j1_nombre: "",
        pareja_b_j2_nombre: "",
      })
    ).toBeNull();
  });
});
