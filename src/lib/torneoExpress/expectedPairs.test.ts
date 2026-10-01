import { captureExpectedPairs } from "./expectedPairs";
import type { TorneoExpressGrupoPareja, TorneoExpressPartido } from "./types";

const PARTIDO = {
  pareja_local_id: "pair-local",
  pareja_visitante_id: "pair-visit",
} as TorneoExpressPartido;

function pareja(
  id: string,
  player1: string,
  player2: string
): TorneoExpressGrupoPareja {
  return {
    id: `row-${id}`,
    grupo_id: "grupo",
    pareja_id: id,
    pareja_display: `${player1} / ${player2}`,
    player1_id: player1,
    player2_id: player2,
    created_at: "",
  };
}

describe("captureExpectedPairs", () => {
  it("congela Juan/Pedro al abrir y no sigue un cambio posterior del arreglo", () => {
    const parejas = [
      pareja("pair-local", "juan", "pedro"),
      pareja("pair-visit", "luis", "mario"),
    ];
    const frozen = captureExpectedPairs(PARTIDO, parejas);
    parejas[0] = pareja("pair-local", "juan", "carlos");

    expect(frozen).toEqual({
      local: { pair_id: "pair-local", player1_id: "juan", player2_id: "pedro" },
      visitante: {
        pair_id: "pair-visit",
        player1_id: "luis",
        player2_id: "mario",
      },
    });
  });

  it("al volver a capturar después del cambio, la expectativa es Juan/Carlos", () => {
    const reopened = captureExpectedPairs(PARTIDO, [
      pareja("pair-local", "juan", "carlos"),
      pareja("pair-visit", "luis", "mario"),
    ]);
    expect(reopened?.local.player2_id).toBe("carlos");
  });

  it("invierte el slot si player1 y player2 vienen intercambiados en los datos", () => {
    const swapped = captureExpectedPairs(PARTIDO, [
      pareja("pair-local", "pedro", "juan"),
      pareja("pair-visit", "luis", "mario"),
    ]);
    expect(swapped?.local).toEqual({
      pair_id: "pair-local",
      player1_id: "pedro",
      player2_id: "juan",
    });
  });
});
