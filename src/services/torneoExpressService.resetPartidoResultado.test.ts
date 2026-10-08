import { supabase } from "../lib/supabaseClient";
import {
  resetPartidoResultado,
  TORNEO_CERRADO_RESULTADO_MSG,
} from "../services/torneoExpressService";

jest.mock("../lib/supabaseClient", () => ({
  supabase: {
    auth: { getSession: jest.fn(), getUser: jest.fn() },
    from: jest.fn(),
    rpc: jest.fn(),
  },
  supabasePublicRead: {},
}));

function authOk() {
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: { user: { id: "org-1" } } },
    error: null,
  });
}

function mockFetchAfterReset(row: Record<string, unknown>) {
  (supabase.from as jest.Mock).mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({ data: row, error: null }),
      }),
    }),
  });
}

describe("resetPartidoResultado", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authOk();
  });

  it("borra el marcador vía RPC y recarga el partido pendiente", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: true, status: "updated", partido_id: "partido-1" },
      error: null,
    });
    mockFetchAfterReset({
      id: "partido-1",
      estado: "pendiente",
      puntos_local: null,
      puntos_visitante: null,
    });

    const result = await resetPartidoResultado("partido-1");

    expect(supabase.rpc).toHaveBeenCalledWith(
      "reset_torneo_express_grupo_partido",
      { p_partido_id: "partido-1" }
    );
    expect(result.estado).toBe("pendiente");
  });

  it("rechaza si la fase de grupos ya no está abierta", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: false, error: "group_not_editable" },
      error: null,
    });

    await expect(resetPartidoResultado("partido-1")).rejects.toThrow(
      /fase de grupos ya no está abierta/
    );
  });

  it("rechaza si el torneo está cerrado", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: false, error: "torneo_cerrado" },
      error: null,
    });

    await expect(resetPartidoResultado("partido-1")).rejects.toThrow(
      TORNEO_CERRADO_RESULTADO_MSG
    );
  });

  it("si el RPC no existe, borra el marcador con UPDATE directo", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: {
        code: "PGRST202",
        message: "Could not find the function reset_torneo_express_grupo_partido",
      },
    });

    const updateEq = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === "torneo_express_partidos") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: {
                  id: "partido-1",
                  grupo_id: "g1",
                  estado: "pendiente",
                  puntos_local: null,
                  puntos_visitante: null,
                },
                error: null,
              }),
            }),
          }),
          update: jest.fn().mockReturnValue({ eq: updateEq }),
        };
      }
      if (table === "torneo_express_grupos") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { torneo_id: "t1" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "torneo_express") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({
                data: { fase_torneo: "grupos", estado: "activo" },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await resetPartidoResultado("partido-1");
    expect(updateEq).toHaveBeenCalled();
    expect(result.estado).toBe("pendiente");
  });
});
