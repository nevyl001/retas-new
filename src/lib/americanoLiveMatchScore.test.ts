import { supabase } from "./supabaseClient";
import { applyAmericanoLiveMatchScore, applyAmericanoLiveMetadata } from "./database";

jest.mock("./supabaseClient", () => ({
  supabase: { rpc: jest.fn(), from: jest.fn() },
  supabasePublicRead: { from: jest.fn() },
}));

describe("applyAmericanoLiveMatchScore — guardado atómico por partido (BLK-02)", () => {
  beforeEach(() => {
    (supabase.rpc as jest.Mock).mockReset();
  });

  it("dos dispositivos, partidos DISTINTOS: cada llamada se aplica sin conflicto", async () => {
    (supabase.rpc as jest.Mock)
      .mockResolvedValueOnce({
        data: { ok: true, status: "updated", match_id: "m1", snapshot: { rounds: [] } },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { ok: true, status: "updated", match_id: "m2", snapshot: { rounds: [] } },
        error: null,
      });

    const r1 = await applyAmericanoLiveMatchScore({
      tournamentId: "t1",
      matchId: "m1",
      scoreA: 6,
      scoreB: 4,
    });
    const r2 = await applyAmericanoLiveMatchScore({
      tournamentId: "t1",
      matchId: "m2",
      scoreA: 3,
      scoreB: 6,
    });

    expect(r1.status).toBe("ok");
    expect(r2.status).toBe("ok");
    expect(supabase.rpc).toHaveBeenCalledTimes(2);
    expect(supabase.rpc).toHaveBeenNthCalledWith(
      1,
      "apply_americano_live_match_score",
      expect.objectContaining({ p_match_id: "m1", p_score_a: 6, p_score_b: 4 })
    );
    expect(supabase.rpc).toHaveBeenNthCalledWith(
      2,
      "apply_americano_live_match_score",
      expect.objectContaining({ p_match_id: "m2", p_score_a: 3, p_score_b: 6 })
    );
  });

  it("dos dispositivos, MISMO partido con resultados distintos: la segunda llamada recibe conflicto explícito con el valor real", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: false, error: "conflict", match_id: "m1", score_a: 6, score_b: 4 },
      error: null,
    });

    const result = await applyAmericanoLiveMatchScore({
      tournamentId: "t1",
      matchId: "m1",
      scoreA: 5,
      scoreB: 7,
    });

    expect(result).toEqual({ status: "conflict", scoreA: 6, scoreB: 4 });
  });

  it("doble clic / reintento con el mismo resultado: responde 'unchanged', no se pierde el marcador previo", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: true, status: "unchanged", match_id: "m1", snapshot: { rounds: [] } },
      error: null,
    });

    const result = await applyAmericanoLiveMatchScore({
      tournamentId: "t1",
      matchId: "m1",
      scoreA: 6,
      scoreB: 4,
      force: true,
    });

    expect(result.status).toBe("ok");
  });

  it("corrección explícita con force=true tras conflicto: sobrescribe", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: true, status: "updated", match_id: "m1", snapshot: { rounds: [] } },
      error: null,
    });

    await applyAmericanoLiveMatchScore({
      tournamentId: "t1",
      matchId: "m1",
      scoreA: 5,
      scoreB: 7,
      force: true,
    });

    expect(supabase.rpc).toHaveBeenCalledWith(
      "apply_americano_live_match_score",
      expect.objectContaining({ p_force: true })
    );
  });

  it("usuario sin ownership del torneo: la RPC rechaza", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: "Sin permiso sobre este torneo" },
    });

    const result = await applyAmericanoLiveMatchScore({
      tournamentId: "torneo-ajeno",
      matchId: "m1",
      scoreA: 6,
      scoreB: 4,
    });

    expect(result).toEqual({ status: "error", message: "Sin permiso sobre este torneo" });
  });

  it("ID de torneo manipulado (no existe o config aún no creada): not_found", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: false, error: "not_found" },
      error: null,
    });

    const result = await applyAmericanoLiveMatchScore({
      tournamentId: "no-existe",
      matchId: "m1",
      scoreA: 6,
      scoreB: 4,
    });

    expect(result).toEqual({ status: "not_found" });
  });

  it("partido inexistente dentro del snapshot: match_not_found se traduce a not_found", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: false, error: "match_not_found" },
      error: null,
    });

    const result = await applyAmericanoLiveMatchScore({
      tournamentId: "t1",
      matchId: "no-existe",
      scoreA: 6,
      scoreB: 4,
    });

    expect(result).toEqual({ status: "not_found" });
  });

  it("marcador inválido: se traduce a invalid", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: false, error: "invalid_score" },
      error: null,
    });

    const result = await applyAmericanoLiveMatchScore({
      tournamentId: "t1",
      matchId: "m1",
      scoreA: -1,
      scoreB: 4,
    });

    expect(result).toEqual({ status: "invalid" });
  });

  it("no confía en el reloj del cliente: no se envía ningún savedAt/timestamp local en el payload", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: true, status: "updated", snapshot: { rounds: [] } },
      error: null,
    });

    await applyAmericanoLiveMatchScore({
      tournamentId: "t1",
      matchId: "m1",
      scoreA: 6,
      scoreB: 4,
    });

    const payload = (supabase.rpc as jest.Mock).mock.calls[0][1];
    expect(payload).not.toHaveProperty("p_saved_at");
    expect(payload).not.toHaveProperty("savedAt");
  });
});

describe("applyAmericanoLiveMetadata — no toca `rounds`", () => {
  beforeEach(() => {
    (supabase.rpc as jest.Mock).mockReset();
  });

  it("llama al RPC de metadata, no al de guardado de partido", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { ok: true, snapshot: { rounds: [] } },
      error: null,
    });

    const ok = await applyAmericanoLiveMetadata({
      tournamentId: "t1",
      ranking: [],
      phase: "playing",
      totalRounds: 5,
    });

    expect(ok).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "apply_americano_live_metadata",
      expect.objectContaining({ p_tournament_id: "t1" })
    );
  });

  it("error de RPC: devuelve false sin lanzar", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: "not_found" },
    });

    await expect(
      applyAmericanoLiveMetadata({ tournamentId: "t1" })
    ).resolves.toBe(false);
  });
});
