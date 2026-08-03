import { supabase } from "../lib/supabaseClient";
import {
  saveEliminatoriaResultado,
  savePartidoResultado,
  TORNEO_CERRADO_RESULTADO_MSG,
} from "../services/torneoExpressService";

jest.mock("../lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      getUser: jest.fn(),
    },
    from: jest.fn(),
    rpc: jest.fn(),
  },
  supabasePublicRead: {},
}));

function authOk() {
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: { user: { id: "u1" } } },
    error: null,
  });
}

function chain(result: { data: unknown; error: unknown }) {
  const c: Record<string, jest.Mock> = {};
  const self = () => c;
  c.select = jest.fn(self);
  c.eq = jest.fn(self);
  c.update = jest.fn(self);
  c.single = jest.fn().mockResolvedValue(result);
  c.maybeSingle = jest.fn().mockResolvedValue(result);
  c.order = jest.fn(self);
  return c;
}

describe("torneoExpressService — bloqueo torneo cerrado", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authOk();
  });

  it("savePartidoResultado rechaza si el torneo ya fue cerrado (BLK-06: chequeo server-side vía RPC)", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: false, error: "torneo_cerrado" },
      error: null,
    });

    await expect(
      savePartidoResultado("partido-1", [{ local: 6, visitante: 4 }])
    ).rejects.toThrow(TORNEO_CERRADO_RESULTADO_MSG);

    expect(supabase.rpc).toHaveBeenCalledWith(
      "apply_torneo_express_grupo_resultado",
      expect.objectContaining({ p_partido_id: "partido-1" })
    );
    // El chequeo de "torneo cerrado" ahora es responsabilidad exclusiva del
    // RPC (server-side, bajo lock) — no debe haber ningún fetch/update
    // directo de tabla en este flujo.
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("saveEliminatoriaResultado rechaza si torneo cerrado", async () => {
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === "torneo_express_eliminatoria_partidos") {
        return chain({
          data: {
            id: "e1",
            torneo_id: "t1",
            ronda: 1,
            cruce_index: 0,
            pareja_local_id: "a",
            pareja_visitante_id: "b",
            ganador_id: null,
            es_bye: false,
            estado: "pendiente",
          },
          error: null,
        });
      }
      if (table === "torneo_express") {
        return chain({
          data: {
            id: "t1",
            fase_torneo: "cerrado",
            estado: "finalizado",
          },
          error: null,
        });
      }
      throw new Error(`unexpected table ${table}`);
    });

    await expect(
      saveEliminatoriaResultado("e1", [{ local: 6, visitante: 3 }])
    ).rejects.toThrow(TORNEO_CERRADO_RESULTADO_MSG);
  });
});
