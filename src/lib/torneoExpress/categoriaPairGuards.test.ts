import {
  jugadorYaInscritoEnCategoria,
  replacePairPlayerSlot,
  resolveCategoriaPairTournamentId,
  resolvePlayersIdForPair,
} from "./categoriaPairGuards";

const categoria = [
  { parejaId: "p-ab", player1Id: "juan", player2Id: "pedro" },
  { parejaId: "p-cd", player1Id: "carlos", player2Id: "miguel" },
];

describe("jugadorYaInscritoEnCategoria", () => {
  it("detecta al jugador en otra pareja de esta categoría", () => {
    expect(jugadorYaInscritoEnCategoria(categoria, "pedro", "p-cd")).toBe(true);
  });

  it("permite al propio integrante cuando se excluye su pareja", () => {
    expect(jugadorYaInscritoEnCategoria(categoria, "pedro", "p-ab")).toBe(false);
  });

  it("un jugador que solo está en otra categoría no bloquea", () => {
    expect(jugadorYaInscritoEnCategoria(categoria, "lucia")).toBe(false);
  });
});

describe("replacePairPlayerSlot", () => {
  const pair = {
    player1Id: "juan",
    player2Id: "pedro",
    player1Name: "Juan",
    player2Name: "Pedro",
  };

  it("cambia player1 y deja el nombre del mismo slot sincronizado", () => {
    const result = replacePairPlayerSlot({
      pair,
      outgoingPlayerId: "juan",
      incomingPlayerId: "carlos",
      incomingName: "Carlos",
    });
    expect(result).toEqual({
      ok: true,
      slot: "player1",
      pair: {
        player1Id: "carlos",
        player2Id: "pedro",
        player1Name: "Carlos",
        player2Name: "Pedro",
      },
    });
  });

  it("cambia player2 sin tocar el slot que se queda", () => {
    const result = replacePairPlayerSlot({
      pair,
      outgoingPlayerId: "pedro",
      incomingPlayerId: "carlos",
      incomingName: "Carlos",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slot).toBe("player2");
    expect(result.pair.player2Id).toBe("carlos");
    expect(result.pair.player2Name).toBe("Carlos");
    expect(result.pair.player1Id).toBe("juan");
    expect(result.pair.player1Name).toBe("Juan");
  });

  it("rechaza al compañero actual y a quien no pertenece a la pareja", () => {
    expect(
      replacePairPlayerSlot({
        pair,
        outgoingPlayerId: "pedro",
        incomingPlayerId: "juan",
        incomingName: "Juan",
      }).ok
    ).toBe(false);
    expect(
      replacePairPlayerSlot({
        pair,
        outgoingPlayerId: "ajeno",
        incomingPlayerId: "carlos",
        incomingName: "Carlos",
      })
    ).toEqual({ ok: false, code: "OUTGOING_NOT_IN_PAIR" });
  });
});

describe("resolvePlayersIdForPair", () => {
  it("usa el legacy player id y nunca el id de Riviera si no hay vínculo", () => {
    expect(
      resolvePlayersIdForPair({
        rivieraJugadorId: "riv-1",
        legacyPlayerId: "player-1",
      })
    ).toEqual({ ok: true, playersId: "player-1" });
    expect(
      resolvePlayersIdForPair({
        rivieraJugadorId: "riv-1",
        legacyPlayerId: null,
      })
    ).toEqual({ ok: false, code: "PLAYER_NOT_LINKED" });
  });
});

describe("resolveCategoriaPairTournamentId", () => {
  it("acepta un único tournament_id compartido", () => {
    expect(
      resolveCategoriaPairTournamentId([
        { parejaId: "a", tournamentId: "t-1" },
        { parejaId: "b", tournamentId: "t-1" },
      ])
    ).toEqual({ ok: true, tournamentId: "t-1" });
  });

  it("aborta si no hay parejas o hay más de un tournament_id", () => {
    expect(resolveCategoriaPairTournamentId([])).toEqual({
      ok: false,
      code: "PAIR_TOURNAMENT_UNRESOLVED",
    });
    expect(
      resolveCategoriaPairTournamentId([
        { parejaId: "a", tournamentId: "t-1" },
        { parejaId: "b", tournamentId: "t-2" },
      ])
    ).toEqual({ ok: false, code: "PAIR_TOURNAMENT_UNRESOLVED" });
    expect(
      resolveCategoriaPairTournamentId([
        { parejaId: "a", tournamentId: null },
      ])
    ).toEqual({ ok: false, code: "PAIR_TOURNAMENT_UNRESOLVED" });
  });
});
