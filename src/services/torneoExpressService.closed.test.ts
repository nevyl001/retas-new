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

  it("savePartidoResultado rechaza si fase_torneo=cerrado", async () => {
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === "torneo_express_partidos") {
        return chain({
          data: {
            pareja_local_id: "p1",
            pareja_visitante_id: "p2",
            grupo_id: "g1",
          },
          error: null,
        });
      }
      if (table === "torneo_express_grupos") {
        return chain({ data: { torneo_id: "t1" }, error: null });
      }
      if (table === "torneo_express") {
        return chain({
          data: {
            id: "t1",
            fase_torneo: "cerrado",
            estado: "en_curso",
          },
          error: null,
        });
      }
      throw new Error(`unexpected table ${table}`);
    });

    await expect(
      savePartidoResultado("partido-1", [{ local: 6, visitante: 4 }])
    ).rejects.toThrow(TORNEO_CERRADO_RESULTADO_MSG);

    const updateCalls = (supabase.from as jest.Mock).mock.calls.filter(
      (c) => c[0] === "torneo_express_partidos"
    );
    // Solo el fetch inicial; no update de resultado.
    expect(updateCalls.length).toBe(1);
  });

  it("savePartidoResultado rechaza si estado=finalizado", async () => {
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === "torneo_express_partidos") {
        return chain({
          data: {
            pareja_local_id: "p1",
            pareja_visitante_id: "p2",
            grupo_id: "g1",
          },
          error: null,
        });
      }
      if (table === "torneo_express_grupos") {
        return chain({ data: { torneo_id: "t1" }, error: null });
      }
      if (table === "torneo_express") {
        return chain({
          data: {
            id: "t1",
            fase_torneo: "grupos",
            estado: "finalizado",
          },
          error: null,
        });
      }
      throw new Error(`unexpected table ${table}`);
    });

    await expect(
      savePartidoResultado("partido-1", [{ local: 6, visitante: 4 }])
    ).rejects.toThrow(TORNEO_CERRADO_RESULTADO_MSG);
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
