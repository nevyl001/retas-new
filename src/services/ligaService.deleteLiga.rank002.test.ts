/**
 * Regresión RANK-002 (2026-07-29): deleteLiga() borraba el árbol de la liga
 * paso a paso desde el cliente sin revertir jugador_participaciones/
 * rating_historial/riviera_official_points_ledger. Ahora delega en la RPC
 * transaccional admin_delete_liga_cascade (ver
 * supabase/fix-rank002-safe-delete-cascade-20260729.sql), que sí revierte
 * todo antes de borrar. Este test fija que el cliente llama a esa RPC con
 * los parámetros correctos y ya no hace DELETE multi-paso.
 */
jest.mock("../lib/supabaseClient", () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
    auth: { getUser: jest.fn() },
  },
}));

import { supabase } from "../lib/supabaseClient";
import { deleteLiga } from "./ligaService";

const mockRpc = supabase.rpc as jest.Mock;
const mockFrom = supabase.from as jest.Mock;

describe("deleteLiga — RANK-002", () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockFrom.mockReset();
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: "org-1" } },
      error: null,
    });
  });

  it("llama a la RPC admin_delete_liga_cascade con organizador_id y liga_id, sin tocar tablas directamente", async () => {
    mockRpc.mockResolvedValue({ data: { status: "deleted" }, error: null });

    await deleteLiga("liga-123");

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("admin_delete_liga_cascade", {
      p_organizador_id: "org-1",
      p_liga_id: "liga-123",
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("lanza un error legible si la liga no existe", async () => {
    mockRpc.mockResolvedValue({ data: { status: "not_found" }, error: null });

    await expect(deleteLiga("liga-inexistente")).rejects.toThrow(
      "Liga no encontrada."
    );
  });

  it("propaga el error de la RPC (p.ej. rechazo por RLS/ownership)", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "Sin permiso para eliminar esta liga" },
    });

    await expect(deleteLiga("liga-ajena")).rejects.toThrow(
      "Sin permiso para eliminar esta liga"
    );
  });
});
