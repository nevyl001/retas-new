/**
 * Regresión RANK-002 (2026-07-29): deleteLiga() borraba el árbol de la liga
 * paso a paso desde el cliente sin revertir jugador_participaciones/
 * rating_historial/riviera_official_points_ledger. Ahora delega en la RPC
 * transaccional admin_delete_liga_cascade (ver
 * supabase/fix-rank002-safe-delete-cascade-20260729.sql), que sí revierte
 * todo antes de borrar. Este test fija que el cliente llama a esa RPC con
 * los parámetros correctos y ya no hace DELETE multi-paso.
 */
import { supabase } from "../lib/supabaseClient";
import { deleteLiga } from "./ligaService";

jest.mock("../lib/supabaseClient", () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
    auth: { getUser: jest.fn() },
  },
}));

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

  it("no borra una liga con historial y pide archivarla", async () => {
    mockRpc.mockResolvedValue({ data: { status: "has_activity" }, error: null });

    await expect(deleteLiga("liga-con-partidos")).rejects.toThrow(
      "No es posible eliminar esta liga"
    );
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("traduce el choque de la llave de partidos sin mostrar SQL", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        message:
          'update or delete on table "ligas" violates foreign key constraint "liga_partidos_liga_id_fkey" on table "liga_partidos"',
      },
    });

    await expect(deleteLiga("liga-playoffs")).rejects.toThrow(
      "No es posible eliminar esta liga"
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
