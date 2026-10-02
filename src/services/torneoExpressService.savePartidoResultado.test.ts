import { supabase } from "../lib/supabaseClient";
import {
  savePartidoResultado,
  confirmarFaseEliminatoria,
  TorneoExpressResultadoConflictError,
  TorneoExpressComposicionCambiadaError,
  PAIR_COMPOSITION_CHANGED_MSG,
} from "../services/torneoExpressService";

jest.mock("../lib/supabaseClient", () => ({
  supabase: {
    auth: { getSession: jest.fn(), getUser: jest.fn() },
    from: jest.fn(),
    rpc: jest.fn(),
  },
  supabasePublicRead: {},
}));

const VALID_SETS = [{ local: 6, visitante: 4 }];
const EXPECTED = {
  local: {
    pair_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    player1_id: "20000000-0000-0000-0000-000000000001",
    player2_id: "20000000-0000-0000-0000-000000000002",
    is_virtual: false,
  },
  visitante: {
    pair_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    player1_id: "20000000-0000-0000-0000-000000000003",
    player2_id: "20000000-0000-0000-0000-000000000004",
    is_virtual: false,
  },
};

function authOk() {
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: { user: { id: "org-1" } } },
    error: null,
  });
}

function mockFetchAfterSave(row: Record<string, unknown>) {
  (supabase.from as jest.Mock).mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({ data: row, error: null }),
      }),
    }),
  });
}

describe("savePartidoResultado — guardado atómico fase de grupos (BLK-06)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authOk();
  });

  it("guardado normal: llama al RPC con el payload calculado y devuelve el partido recargado", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: true, status: "updated", partido_id: "partido-1" },
      error: null,
    });
    mockFetchAfterSave({ id: "partido-1", puntos_local: 6, puntos_visitante: 4 });

    const result = await savePartidoResultado("partido-1", VALID_SETS, EXPECTED);

    expect(supabase.rpc).toHaveBeenCalledWith(
      "apply_torneo_express_grupo_resultado",
      expect.objectContaining({
        p_partido_id: "partido-1",
        p_puntos_local: 6,
        p_puntos_visitante: 4,
        p_ganador_side: "local",
        p_force: false,
        p_expected_pairs: EXPECTED,
      })
    );
    expect(result).toEqual({ id: "partido-1", puntos_local: 6, puntos_visitante: 4 });
  });

  it("doble clic (mismo resultado): RPC responde 'unchanged', no re-dispara rating", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: true, status: "unchanged", partido_id: "partido-1" },
      error: null,
    });
    mockFetchAfterSave({ id: "partido-1" });

    await expect(savePartidoResultado("partido-1", VALID_SETS, EXPECTED)).resolves.toBeTruthy();
    // Un solo llamado a rpc, sin reintento propio.
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it("dos resultados distintos simultáneos: el segundo recibe conflicto explícito", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: {
        ok: false,
        error: "conflict",
        puntos_local: 6,
        puntos_visitante: 2,
      },
      error: null,
    });

    await expect(
      savePartidoResultado("partido-1", VALID_SETS, EXPECTED)
    ).rejects.toBeInstanceOf(TorneoExpressResultadoConflictError);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it("reintento con force=true tras conflicto: sobrescribe correctamente", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: true, status: "updated", partido_id: "partido-1" },
      error: null,
    });
    mockFetchAfterSave({ id: "partido-1" });

    await savePartidoResultado("partido-1", VALID_SETS, EXPECTED, true);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "apply_torneo_express_grupo_resultado",
      expect.objectContaining({ p_force: true, p_expected_pairs: EXPECTED })
    );
  });

  it("composición distinta: no ofrece sobrescribir y conserva la expectativa en el RPC", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: false, error: "PAIR_COMPOSITION_CHANGED" },
      error: null,
    });

    await expect(
      savePartidoResultado("partido-1", VALID_SETS, EXPECTED, true)
    ).rejects.toBeInstanceOf(TorneoExpressComposicionCambiadaError);
    await expect(
      savePartidoResultado("partido-1", VALID_SETS, EXPECTED, true)
    ).rejects.toThrow(PAIR_COMPOSITION_CHANGED_MSG);
    expect(PAIR_COMPOSITION_CHANGED_MSG.includes("sobrescribir")).toBe(false);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "apply_torneo_express_grupo_resultado",
      expect.objectContaining({
        p_force: true,
        p_expected_pairs: EXPECTED,
      })
    );
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("partido inexistente: mensaje explícito, sin fetch posterior", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: false, error: "not_found" },
      error: null,
    });

    await expect(
      savePartidoResultado("no-existe", VALID_SETS, EXPECTED)
    ).rejects.toThrow("Partido no encontrado.");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("organizador ajeno / sin permiso: la RPC rechaza, sin escritura", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: "Sin permiso sobre este torneo" },
    });

    await expect(
      savePartidoResultado("partido-ajeno", VALID_SETS, EXPECTED)
    ).rejects.toThrow("Sin permiso sobre este torneo");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("resultado inválido (1-1 en sets sin tercer set): se rechaza antes de llamar al RPC (validación de cliente)", async () => {
    await expect(
      savePartidoResultado(
        "partido-1",
        [
          { local: 6, visitante: 4 },
          { local: 4, visitante: 6 },
        ],
        EXPECTED
      )
    ).rejects.toThrow(/empatado/i);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("categoría/torneo cerrado: mensaje de torneo cerrado, sin escritura", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: false, error: "torneo_cerrado" },
      error: null,
    });

    await expect(savePartidoResultado("partido-1", VALID_SETS, EXPECTED)).rejects.toThrow(
      /cerrad/i
    );
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe("confirmarFaseEliminatoria — no generar el bracket dos veces (BLK-06)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authOk();
  });

  it("primera confirmación: transiciona y genera el bracket", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: true, torneo_id: "t1" },
      error: null,
    });
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === "torneo_express") {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest
                .fn()
                .mockResolvedValue({ data: { id: "t1", fase_torneo: "eliminatoria" }, error: null }),
            }),
          }),
        };
      }
      if (table === "torneo_express_eliminatoria_partidos") {
        return {
          delete: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ error: null }),
          }),
          insert: jest.fn().mockResolvedValue({ error: null }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await confirmarFaseEliminatoria("t1", "semifinal", []);
    expect(result).toEqual({ id: "t1", fase_torneo: "eliminatoria" });
  });

  it("segunda confirmación concurrente: la transición ya ocurrió, se rechaza sin tocar el bracket", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: false, error: "ya_en_eliminatoria" },
      error: null,
    });

    await expect(confirmarFaseEliminatoria("t1", "semifinal", [])).rejects.toThrow(
      /ya fue generado/i
    );
    // No debe tocar torneo_express_eliminatoria_partidos si la transición falló.
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
