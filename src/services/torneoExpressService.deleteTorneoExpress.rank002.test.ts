/**
 * Regresión RANK-002 (2026-07-29): deleteTorneoExpress() borraba el árbol
 * del torneo paso a paso desde el cliente sin revertir
 * jugador_participaciones/rating_historial/riviera_official_points_ledger.
 * Ahora delega en la RPC transaccional
 * admin_delete_torneo_express_categoria_cascade (ver
 * supabase/fix-rank002-safe-delete-cascade-20260729.sql), que sí revierte
 * todo antes de borrar (el árbol de tablas hijas se va solo por ON DELETE
 * CASCADE dentro de la RPC). Este test fija que el cliente llama a esa RPC
 * con los parámetros correctos y ya no hace DELETE multi-paso.
 */
import { supabase } from "../lib/supabaseClient";
import { deleteTorneoExpress } from "./torneoExpressService";

jest.mock("../lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      getUser: jest.fn(),
    },
    rpc: jest.fn(),
    from: jest.fn(),
  },
  supabasePublicRead: {},
}));

const mockRpc = supabase.rpc as jest.Mock;
const mockFrom = supabase.from as jest.Mock;

function authOk() {
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: { user: { id: "org-1" } } },
    error: null,
  });
}

describe("deleteTorneoExpress — RANK-002", () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockFrom.mockReset();
    authOk();
  });

  it("llama a la RPC admin_delete_torneo_express_categoria_cascade con organizador_id y torneo_id, sin tocar tablas directamente", async () => {
    mockRpc.mockResolvedValue({ data: { status: "deleted" }, error: null });

    await deleteTorneoExpress("torneo-123");

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith(
      "admin_delete_torneo_express_categoria_cascade",
      { p_organizador_id: "org-1", p_torneo_id: "torneo-123" }
    );
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("lanza un error legible si el torneo no existe", async () => {
    mockRpc.mockResolvedValue({ data: { status: "not_found" }, error: null });

    await expect(deleteTorneoExpress("torneo-inexistente")).rejects.toThrow(
      "Torneo no encontrado"
    );
  });

  it("propaga el error de la RPC (p.ej. rechazo por RLS/ownership)", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "Sin permiso para eliminar este torneo" },
    });

    await expect(deleteTorneoExpress("torneo-ajeno")).rejects.toThrow(
      "Sin permiso para eliminar este torneo"
    );
  });
});
