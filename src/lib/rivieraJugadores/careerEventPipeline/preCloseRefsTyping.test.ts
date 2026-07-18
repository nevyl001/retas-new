import {
  collectProspectiveJugadorRefs,
  formatIdentityPreCloseMessage,
} from "./preCloseGuards";
import type { FinalizeCareerEventInput } from "./types";
import type { Pair } from "../../database";
import type { Duelo2v2 } from "../../duelo2v2/types";

function pair(
  p1: string,
  n1: string,
  p2: string,
  n2: string
): Pair {
  return {
    id: `pair-${p1}`,
    tournament_id: "t1",
    player1_id: p1,
    player2_id: p2,
    player1_name: n1,
    player2_name: n2,
    created_at: "",
  } as Pair;
}

describe("collectProspectiveJugadorRefs — tipado de IDs", () => {
  it("Reta: players.id solo como legacyPlayerId; jugadorId undefined", () => {
    const input: FinalizeCareerEventInput = {
      kind: "reta",
      organizadorId: "org",
      tournament: { id: "t1", name: "Reta", is_finished: false } as never,
      pairs: [pair("players-uuid-a", "Juan", "players-uuid-b", "Pedro")],
      matches: [],
    };

    const refs = collectProspectiveJugadorRefs(input);
    expect(refs).toHaveLength(2);
    expect(refs[0]).toEqual({
      nombre: "Juan",
      legacyPlayerId: "players-uuid-a",
      jugadorId: undefined,
      legacyLigaJugadorId: undefined,
    });
    expect(refs[1]).toEqual({
      nombre: "Pedro",
      legacyPlayerId: "players-uuid-b",
      jugadorId: undefined,
      legacyLigaJugadorId: undefined,
    });
    expect(refs.every((r) => r.jugadorId === undefined)).toBe(true);
  });

  it("Liga inscripción: liga_jugadores.id solo como legacyLigaJugadorId", () => {
    const input: FinalizeCareerEventInput = {
      kind: "liga_inscripcion",
      organizadorId: "org",
      ligaId: "liga-1",
      jugadorId: "liga-jugador-uuid",
    };

    const refs = collectProspectiveJugadorRefs(input);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({
      legacyLigaJugadorId: "liga-jugador-uuid",
      jugadorId: undefined,
      legacyPlayerId: undefined,
      nombre: undefined,
    });
  });

  it("Duelo: riviera_jugadores.id como jugadorId explícito", () => {
    const duelo = {
      id: "d1",
      organizador_id: "org",
      pareja_a_j1_id: "riviera-1",
      pareja_a_j2_id: "riviera-2",
      pareja_a_j1_nombre: "A1",
      pareja_a_j2_nombre: "A2",
      pareja_b_j1_id: "riviera-3",
      pareja_b_j2_id: "riviera-4",
      pareja_b_j1_nombre: "B1",
      pareja_b_j2_nombre: "B2",
    } as Duelo2v2;

    const refs = collectProspectiveJugadorRefs({
      kind: "duelo_2v2",
      organizadorId: "org",
      duelo,
    });

    expect(refs).toHaveLength(4);
    expect(refs.map((r) => r.jugadorId)).toEqual([
      "riviera-1",
      "riviera-2",
      "riviera-3",
      "riviera-4",
    ]);
    expect(refs.every((r) => r.legacyPlayerId === undefined)).toBe(true);
    expect(refs.every((r) => r.legacyLigaJugadorId === undefined)).toBe(true);
  });

  it("Americano: roster.id como legacyPlayerId", () => {
    const refs = collectProspectiveJugadorRefs({
      kind: "americano",
      organizadorId: "org",
      sesionId: "s1",
      nombre: "Sesión",
      roster: [
        { id: "players-1", name: "Ana" } as never,
        { id: "players-2", name: "Luis" } as never,
      ],
      rounds: [],
    });
    expect(refs.every((r) => r.jugadorId === undefined)).toBe(true);
    expect(refs.map((r) => r.legacyPlayerId)).toEqual(["players-1", "players-2"]);
  });
});

describe("formatIdentityPreCloseMessage", () => {
  it("incluye nombre visual y acción sugerida", () => {
    const msg = formatIdentityPreCloseMessage({
      kind: "reta",
      nombre: "Juan Pérez",
    });
    expect(msg).toContain("Juan Pérez");
    expect(msg).toContain("reta");
    expect(msg).toMatch(/Vuelve a seleccionarlo|vincula/i);
    expect(msg).not.toMatch(/CareerIntegrityException/);
  });
});
