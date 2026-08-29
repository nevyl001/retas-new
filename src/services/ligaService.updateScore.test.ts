import { supabase } from "../lib/supabaseClient";
import { updateScore, LigaScoreConflictError } from "./ligaService";

jest.mock("../lib/supabaseClient", () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
    auth: { getUser: jest.fn() },
  },
}));

const AUTH_USER = { id: "org-1", email: "org1@test.com" };

function mockAuthenticated() {
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: AUTH_USER },
    error: null,
  });
}

function mockCascadeNoOp() {
  // La cascada post-update (avance de ronda / jornada) hace varias llamadas
  // .from(...).select(...).eq(...) encadenadas. Para los tests que solo
  // verifican el guardado atómico, devolvemos "ronda incompleta" en el
  // primer select para que la cascada corte temprano sin más llamadas.
  (supabase.from as jest.Mock).mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: [{ id: "p1", estado: "upcoming" }],
          error: null,
        }),
      }),
    }),
  });
}

describe("updateScore (liga) — guardado atómico", () => {
  beforeEach(() => {
    (supabase.rpc as jest.Mock).mockReset();
    (supabase.from as jest.Mock).mockReset();
    (supabase.auth.getUser as jest.Mock).mockReset();
    mockAuthenticated();
  });

  it("guardado normal: llama al RPC con los parámetros correctos y no lanza", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: true, status: "updated", jornada_id: "j1", ronda: 1 },
      error: null,
    });
    mockCascadeNoOp();

    await expect(
      updateScore("partido-1", 6, 4, false)
    ).resolves.toBeUndefined();

    expect(supabase.rpc).toHaveBeenCalledWith("update_liga_partido_score", {
      p_partido_id: "partido-1",
      p_score1: 6,
      p_score2: 4,
      p_force: false,
    });
  });

  it("conflicto: la segunda escritura recibe LigaScoreConflictError y NO reintenta el UPDATE por su cuenta", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: {
        ok: false,
        error: "conflict",
        score_pareja1: 6,
        score_pareja2: 2,
      },
      error: null,
    });

    const promise = updateScore("partido-1", 6, 4, false);
    await expect(promise).rejects.toBeInstanceOf(LigaScoreConflictError);
    await expect(promise).rejects.toThrow(/sobrescribir/);
    await expect(promise).rejects.toThrow(/6-2/);

    // updateScore se invocó una sola vez — el cliente no reintenta por su cuenta.
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it("partido ya completed sin force: el RPC responde conflict y se traduce a error explícito", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: {
        ok: false,
        error: "conflict",
        score_pareja1: 6,
        score_pareja2: 3,
      },
      error: null,
    });

    await expect(updateScore("partido-1", 7, 5, false)).rejects.toThrow(
      LigaScoreConflictError
    );
  });

  it("force autorizado: sobrescribe y continúa la cascada normalmente", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: true, status: "updated", jornada_id: "j1", ronda: 2 },
      error: null,
    });
    mockCascadeNoOp();

    await expect(updateScore("partido-1", 6, 4, true)).resolves.toBeUndefined();
    expect(supabase.rpc).toHaveBeenCalledWith(
      "update_liga_partido_score",
      expect.objectContaining({ p_force: true })
    );
  });

  it("force no autorizado (partido de otra liga/organizador): la RPC lanza y no se sobreescribe nada", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: "Sin permiso sobre este partido" },
    });

    await expect(updateScore("partido-ajeno", 6, 4, true)).rejects.toThrow(
      "Sin permiso sobre este partido"
    );
    // No se debe haber intentado ninguna operación de cascada tras el error del RPC.
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("partido de otra liga/organizador (sin force): mismo rechazo por ownership", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: "Sin permiso sobre este partido" },
    });

    await expect(updateScore("partido-ajeno", 6, 4, false)).rejects.toThrow(
      "Sin permiso sobre este partido"
    );
  });

  it("marcador inválido: el RPC lo rechaza y el mensaje es claro", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: false, error: "invalid_score" },
      error: null,
    });

    await expect(updateScore("partido-1", -1, 4, false)).rejects.toThrow(
      "Marcador inválido."
    );
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("error de RPC no deja actualización parcial: ninguna llamada de cascada se dispara", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: "network error / timeout" },
    });

    await expect(updateScore("partido-1", 6, 4, false)).rejects.toThrow(
      "network error / timeout"
    );
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("reenvío idempotente del mismo marcador (status:'unchanged') no re-dispara la cascada", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: true, status: "unchanged", jornada_id: "j1", ronda: 1 },
      error: null,
    });

    await expect(
      updateScore("partido-1", 6, 4, true)
    ).resolves.toBeUndefined();

    // status 'unchanged' corta antes de tocar liga_partidos/liga_jornadas de nuevo.
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("partido no encontrado: mensaje explícito, sin cascada", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: false, error: "not_found" },
      error: null,
    });

    await expect(updateScore("no-existe", 6, 4, false)).rejects.toThrow(
      "Partido no encontrado."
    );
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
