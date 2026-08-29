/**
 * Regresión RANK-001 (2026-07-29): antes, aplicarRatingPartido() cortaba en
 * el cliente ("ya existe una fila para este partido_ref -> return true")
 * SIN llamar nunca al RPC. Eso significaba que, aunque el RPC
 * aplicar_rating_partido aprendiera a reconciliar un resultado corregido
 * (ver supabase/fix-rank001-rating-ledger-reconciliation-20260729.sql), el
 * cliente jamás le daba la oportunidad de hacerlo. Este test fija que el
 * cliente SIEMPRE delega la decisión al RPC.
 */
import { supabase } from "../supabaseClient";
import { aplicarRatingPartido } from "./aplicarRatingPartido";

jest.mock("../supabaseClient", () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
  },
}));

const mockRpc = supabase.rpc as jest.Mock;

describe("aplicarRatingPartido — RANK-001", () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it("llama siempre al RPC aplicar_rating_partido, incluso si un partido_ref ya tiene historial (el RPC decide, no el cliente)", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const ok = await aplicarRatingPartido({
      j1: "j1",
      j2: "j2",
      j3: "j3",
      j4: "j4",
      ganador: "b",
      modoJuego: "reta_rr",
      partidoRef: "reta:ya-tiene-historial",
    });

    expect(ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("aplicar_rating_partido", {
      p_j1: "j1",
      p_j2: "j2",
      p_j3: "j3",
      p_j4: "j4",
      p_ganador: "b",
      p_modo_juego: "reta_rr",
      p_partido_ref: "reta:ya-tiene-historial",
      p_descripcion: null,
    });
    // No debe consultar rating_historial directamente antes de decidir --
    // esa lógica ahora vive solo en el RPC.
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("no llama al RPC si faltan jugadores (guard de parámetros incompletos)", async () => {
    const ok = await aplicarRatingPartido({
      j1: "j1",
      j2: "",
      j3: "j3",
      j4: "j4",
      ganador: "a",
      modoJuego: "reta_rr",
      partidoRef: "reta:incompleto",
    });

    expect(ok).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("trata un conflicto de índice único (23505) como éxito idempotente, no como fallo", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    });

    const ok = await aplicarRatingPartido({
      j1: "j1",
      j2: "j2",
      j3: "j3",
      j4: "j4",
      ganador: "a",
      modoJuego: "reta_rr",
      partidoRef: "reta:race-condition",
    });

    expect(ok).toBe(true);
  });
});
