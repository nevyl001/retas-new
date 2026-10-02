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
      local: {
        pair_id: "pair-local",
        player1_id: "juan",
        player2_id: "pedro",
        is_virtual: false,
      },
      visitante: {
        pair_id: "pair-visit",
        player1_id: "luis",
        player2_id: "mario",
        is_virtual: false,
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
      is_virtual: false,
    });
  });
});

function slot(
  id: string,
  opts: {
    isVirtual?: boolean;
    player1?: string | null;
    player2?: string | null;
    display: string;
  }
): TorneoExpressGrupoPareja {
  return {
    id: `row-${id}`,
    grupo_id: "grupo",
    pareja_id: id,
    pareja_display: opts.display,
    player1_id: opts.player1 ?? null,
    player2_id: opts.player2 ?? null,
    is_virtual: opts.isVirtual === true,
    virtual_label: opts.isVirtual ? opts.display : null,
    created_at: "",
  };
}

describe("captureExpectedPairs — forma real y virtual", () => {
  const visitReal = slot("pair-visit", {
    display: "Luis / Mario",
    player1: "luis",
    player2: "mario",
  });

  it("REAL vs REAL exige ambos ids y is_virtual false", () => {
    const captured = captureExpectedPairs(PARTIDO, [
      slot("pair-local", { display: "Juan / Pedro", player1: "juan", player2: "pedro" }),
      visitReal,
    ]);
    expect(captured?.local).toEqual({
      pair_id: "pair-local",
      player1_id: "juan",
      player2_id: "pedro",
      is_virtual: false,
    });
  });

  it("REAL vs VIRTUAL acepta ids null solo en el lado virtual", () => {
    const captured = captureExpectedPairs(PARTIDO, [
      slot("pair-local", { display: "Juan / Pedro", player1: "juan", player2: "pedro" }),
      slot("pair-visit", { isVirtual: true, display: "Pareja por definir 2" }),
    ]);
    expect(captured).toEqual({
      local: {
        pair_id: "pair-local",
        player1_id: "juan",
        player2_id: "pedro",
        is_virtual: false,
      },
      visitante: {
        pair_id: "pair-visit",
        player1_id: null,
        player2_id: null,
        is_virtual: true,
      },
    });
  });

  it("VIRTUAL vs REAL y VIRTUAL vs VIRTUAL no se descartan por ids null", () => {
    const againstReal = captureExpectedPairs(PARTIDO, [
      slot("pair-local", { isVirtual: true, display: "Pareja por definir 1" }),
      visitReal,
    ]);
    const againstVirtual = captureExpectedPairs(PARTIDO, [
      slot("pair-local", { isVirtual: true, display: "Pareja por definir 1" }),
      slot("pair-visit", { isVirtual: true, display: "Pareja por definir 2" }),
    ]);
    expect(againstReal?.local.is_virtual).toBe(true);
    expect(againstReal?.visitante.is_virtual).toBe(false);
    expect(againstVirtual).toEqual({
      local: {
        pair_id: "pair-local",
        player1_id: null,
        player2_id: null,
        is_virtual: true,
      },
      visitante: {
        pair_id: "pair-visit",
        player1_id: null,
        player2_id: null,
        is_virtual: true,
      },
    });
  });

  it("una real incompleta o una virtual con ids es inválida", () => {
    expect(
      captureExpectedPairs(PARTIDO, [
        slot("pair-local", { display: "Juan", player1: "juan", player2: null }),
        visitReal,
      ])
    ).toBeNull();
    expect(
      captureExpectedPairs(PARTIDO, [
        slot("pair-local", {
          isVirtual: true,
          display: "Pareja por definir 1",
          player1: "mara",
          player2: null,
        }),
        visitReal,
      ])
    ).toBeNull();
  });
});
