import { supabase } from "../lib/supabaseClient";
import {
  updateScoreParejasFijas,
  LigaScoreConflictError,
} from "./ligaService";
import type { LigaPartidoSetScore } from "../lib/liga/parejasFijasMatchScore";

// jest.mock se "hoistea" automáticamente por encima de los imports de arriba
// (babel-plugin-jest-hoist) — evita el conflicto con la regla import/first.
jest.mock("../lib/supabaseClient", () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
    auth: { getUser: jest.fn() },
  },
}));

const AUTH_USER = { id: "org-1", email: "org1@test.com" };

const SETS: LigaPartidoSetScore[] = [
  { p1: 6, p2: 4, kind: "regular" },
  { p1: 6, p2: 3, kind: "regular" },
];

function mockAuthenticated() {
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: AUTH_USER },
    error: null,
  });
}

/**
 * Corta la cascada antes de recalcularPuntosLiga (fuera de alcance de BLK-03,
 * que solo cubre el guardado atómico) devolviendo liga_id=null — mismo
 * recurso que usa el test homónimo de updateScore (rotativa) al detenerse en
 * "ronda incompleta" antes de tocar lógica de puntos no relacionada.
 */
function mockCascadeNoOp() {
  (supabase.from as jest.Mock).mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({
          data: { liga_id: null },
          error: null,
        }),
      }),
    }),
  });
}

describe("updateScoreParejasFijas — guardado atómico (BLK-03)", () => {
  beforeEach(() => {
    (supabase.rpc as jest.Mock).mockReset();
    (supabase.from as jest.Mock).mockReset();
    (supabase.auth.getUser as jest.Mock).mockReset();
    mockAuthenticated();
  });

  it("guardado normal: llama al RPC con los totales calculados y no lanza", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: true, status: "updated", jornada_id: "j1" },
      error: null,
    });
    mockCascadeNoOp();

    await expect(
      updateScoreParejasFijas("partido-1", SETS, false)
    ).resolves.toEqual({ setScoresPersisted: true });

    expect(supabase.rpc).toHaveBeenCalledWith(
      "update_liga_partido_score_parejas_fijas",
      {
        p_partido_id: "partido-1",
        p_score1: 12,
        p_score2: 7,
        p_set_scores: { sets: SETS },
        p_force: false,
      }
    );
  });

  it("doble clic con el mismo resultado: RPC responde 'unchanged', no re-dispara la cascada", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: true, status: "unchanged", jornada_id: "j1" },
      error: null,
    });

    await expect(
      updateScoreParejasFijas("partido-1", SETS, true)
    ).resolves.toEqual({ setScoresPersisted: true });

    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("dos resultados distintos simultáneos: el segundo recibe LigaScoreConflictError y no reintenta solo", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: {
        ok: false,
        error: "conflict",
        score_pareja1: 12,
        score_pareja2: 7,
      },
      error: null,
    });

    const promise = updateScoreParejasFijas("partido-1", SETS, false);
    await expect(promise).rejects.toBeInstanceOf(LigaScoreConflictError);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it("partido ya cerrado (completed) sin force: conflicto explícito, no sobrescribe", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: {
        ok: false,
        error: "conflict",
        score_pareja1: 12,
        score_pareja2: 7,
      },
      error: null,
    });

    await expect(
      updateScoreParejasFijas("partido-1", SETS, false)
    ).rejects.toThrow(LigaScoreConflictError);
  });

  it("corrección explícita con force=true: sobrescribe y continúa la cascada", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: true, status: "updated", jornada_id: "j1" },
      error: null,
    });
    mockCascadeNoOp();

    await expect(
      updateScoreParejasFijas("partido-1", SETS, true)
    ).resolves.toEqual({ setScoresPersisted: true });
    expect(supabase.rpc).toHaveBeenCalledWith(
      "update_liga_partido_score_parejas_fijas",
      expect.objectContaining({ p_force: true })
    );
  });

  it("liga de otro organizador: la RPC rechaza por ownership, sin escritura de cascada", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: "Sin permiso sobre este partido" },
    });

    await expect(
      updateScoreParejasFijas("partido-ajeno", SETS, false)
    ).rejects.toThrow("Sin permiso sobre este partido");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("partido inexistente: mensaje explícito, sin cascada", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: false, error: "not_found" },
      error: null,
    });

    await expect(
      updateScoreParejasFijas("no-existe", SETS, false)
    ).rejects.toThrow("Partido no encontrado.");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("marcador inválido: el RPC lo rechaza con mensaje claro", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: false, error: "invalid_score" },
      error: null,
    });

    await expect(
      updateScoreParejasFijas("partido-1", SETS, false)
    ).rejects.toThrow("Marcador inválido.");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("error de red/timeout en la RPC: no deja actualización parcial (sin cascada)", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: "network error / timeout" },
    });

    await expect(
      updateScoreParejasFijas("partido-1", SETS, false)
    ).rejects.toThrow("network error / timeout");
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
