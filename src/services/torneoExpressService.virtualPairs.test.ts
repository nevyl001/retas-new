import { supabase } from "../lib/supabaseClient";
import { captureExpectedPairs } from "../lib/torneoExpress/expectedPairs";
import type { TorneoExpressGrupoPareja, TorneoExpressPartido } from "../lib/torneoExpress/types";
import {
  fetchPairLabelsByIds,
  savePartidoResultado,
  TorneoExpressComposicionCambiadaError,
} from "./torneoExpressService";

jest.mock("../lib/supabaseClient", () => ({
  supabase: {
    auth: { getSession: jest.fn(), getUser: jest.fn() },
    from: jest.fn(),
    rpc: jest.fn(),
  },
  supabasePublicRead: {},
}));

const PAIR_V = "ffff0000-0000-4000-8000-000000000099";
const PAIR_R = "aaaa0000-0000-4000-8000-000000000001";
const JUAN = "20000000-0000-4000-8000-000000000001";
const PEDRO = "20000000-0000-4000-8000-000000000002";
const MARA = "20000000-0000-4000-8000-000000000011";
const FER = "20000000-0000-4000-8000-000000000012";

const PARTIDO = {
  pareja_local_id: PAIR_V,
  pareja_visitante_id: PAIR_R,
} as TorneoExpressPartido;

function pareja(input: {
  id: string;
  display: string;
  virtual: boolean;
  player1?: string | null;
  player2?: string | null;
}): TorneoExpressGrupoPareja {
  return {
    id: `row-${input.id}`,
    grupo_id: "g1",
    pareja_id: input.id,
    pareja_display: input.display,
    player1_id: input.virtual ? null : (input.player1 ?? null),
    player2_id: input.virtual ? null : (input.player2 ?? null),
    is_virtual: input.virtual,
    virtual_label: input.virtual ? input.display : null,
    created_at: "",
  };
}

describe("fetchPairLabelsByIds", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("lee pairs, no pairs_with_contact, y etiqueta real y virtual", async () => {
    const tables: string[] = [];
    let pairsSelect = "";
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      tables.push(table);
      return {
        select: jest.fn((columns: string) => {
          if (table === "pairs") pairsSelect = columns;
          return {
            in: jest.fn().mockResolvedValue({
              data:
                table === "pairs"
                  ? [
                      {
                        id: PAIR_R,
                        tournament_id: "t1",
                        player1_id: JUAN,
                        player2_id: PEDRO,
                        player1_name: "Juan viejo",
                        player2_name: "Pedro viejo",
                        is_virtual: false,
                        virtual_label: null,
                        created_at: "",
                      },
                      {
                        id: PAIR_V,
                        tournament_id: "t1",
                        player1_id: null,
                        player2_id: null,
                        player1_name: null,
                        player2_name: null,
                        is_virtual: true,
                        virtual_label: "Pareja por definir 1",
                        created_at: "",
                      },
                    ]
                  : [
                      { id: JUAN, name: "Juan" },
                      { id: PEDRO, name: "Pedro" },
                    ],
              error: null,
            }),
          };
        }),
      };
    });

    const labels = await fetchPairLabelsByIds([PAIR_R, PAIR_V]);
    expect(tables).toContain("pairs");
    expect(tables).toContain("players");
    expect(tables).not.toContain("pairs_with_contact");
    expect(pairsSelect).toContain("is_virtual");
    expect(pairsSelect).toContain("virtual_label");
    expect(labels.get(PAIR_R)).toBe("Juan / Pedro");
    expect(labels.get(PAIR_V)).toBe("Pareja por definir 1");
    expect(labels.get(PAIR_V)).not.toContain(PAIR_V);
  });
});

describe("guardado con snapshot virtual congelado", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "org-1" } } },
      error: null,
    });
  });

  it("virtual→real manda el snapshot viejo; force no salta PAIR_COMPOSITION_CHANGED; el reload sí guarda", async () => {
    const frozen = captureExpectedPairs(PARTIDO, [
      pareja({ id: PAIR_V, display: "Pareja por definir 1", virtual: true }),
      pareja({
        id: PAIR_R,
        display: "Juan / Pedro",
        virtual: false,
        player1: JUAN,
        player2: PEDRO,
      }),
    ]);
    expect(frozen?.local).toEqual({
      pair_id: PAIR_V,
      player1_id: null,
      player2_id: null,
      is_virtual: true,
    });

    (supabase.rpc as jest.Mock).mockResolvedValueOnce({
      data: { ok: false, error: "PAIR_COMPOSITION_CHANGED" },
      error: null,
    });

    await expect(
      savePartidoResultado("partido-1", [{ local: 6, visitante: 4 }], frozen!, true)
    ).rejects.toBeInstanceOf(TorneoExpressComposicionCambiadaError);

    expect(supabase.rpc).toHaveBeenCalledWith(
      "apply_torneo_express_grupo_resultado",
      expect.objectContaining({
        p_force: true,
        p_expected_pairs: frozen,
        p_sets_resultado: [{ local: 6, visitante: 4 }],
      })
    );

    const reopened = captureExpectedPairs(PARTIDO, [
      pareja({
        id: PAIR_V,
        display: "Mara / Fernanda",
        virtual: false,
        player1: MARA,
        player2: FER,
      }),
      pareja({
        id: PAIR_R,
        display: "Juan / Pedro",
        virtual: false,
        player1: JUAN,
        player2: PEDRO,
      }),
    ]);
    expect(reopened?.local.pair_id).toBe(PAIR_V);
    expect(reopened?.local).toEqual({
      pair_id: PAIR_V,
      player1_id: MARA,
      player2_id: FER,
      is_virtual: false,
    });

    (supabase.rpc as jest.Mock).mockResolvedValueOnce({
      data: { ok: true, status: "updated", partido_id: "partido-1" },
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({
            data: { id: "partido-1" },
            error: null,
          }),
        }),
      }),
    });

    await expect(
      savePartidoResultado("partido-1", [{ local: 6, visitante: 4 }], reopened!)
    ).resolves.toEqual({ id: "partido-1" });
    expect(supabase.rpc).toHaveBeenLastCalledWith(
      "apply_torneo_express_grupo_resultado",
      expect.objectContaining({
        p_force: false,
        p_expected_pairs: reopened,
      })
    );
  });
});
