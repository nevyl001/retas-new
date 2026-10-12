/**
 * @jest-environment node
 */
import { playerSnapshot } from "./api";
import { supabase } from "../supabaseClient";

jest.mock("../supabaseClient", () => ({ supabase: { rpc: jest.fn() } }));

const rpc = supabase.rpc as unknown as jest.Mock;

describe("playerSnapshot — contrato de la RPC rewards_player_snapshot (0059)", () => {
  beforeEach(() => rpc.mockReset());

  it("envía siempre ambos parámetros con la firma única (uuid, uuid)", async () => {
    rpc.mockResolvedValue({ data: { organizador_id: "o", saldos: [], premios: [], canjes: [] }, error: null });
    await playerSnapshot("j1", "org1");
    await playerSnapshot("j1");
    expect(rpc).toHaveBeenNthCalledWith(1, "rewards_player_snapshot", {
      p_jugador_id: "j1",
      p_organizador_id: "org1",
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "rewards_player_snapshot", {
      p_jugador_id: "j1",
      p_organizador_id: null,
    });
  });

  it("no reintenta ni oculta incompatibilidades de esquema (PGRST202)", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function public.rewards_player_snapshot" },
    });
    await expect(playerSnapshot("j1", "org1")).rejects.toThrow(/Could not find the function/);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("propaga el rechazo de autorización del servidor", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Esta cuenta no está vinculada a este jugador" } });
    await expect(playerSnapshot("j1")).rejects.toThrow(/no está vinculada/);
  });
});
