/**
 * @jest-environment node
 */
import { listPlayers } from "./api";
import { supabase } from "../supabaseClient";

jest.mock("../supabaseClient", () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
  },
}));

const mockRpc = supabase.rpc as unknown as jest.Mock;
const mockFrom = supabase.from as unknown as jest.Mock;

describe("listPlayers — control de RPC vs Fallback y seguridad", () => {
  let mockSelect: jest.Mock;
  let mockEq: jest.Mock;
  let mockOrder: jest.Mock;

  beforeEach(() => {
    mockRpc.mockReset();
    mockFrom.mockReset();

    mockOrder = jest.fn();
    mockEq = jest.fn().mockReturnValue({ order: mockOrder });
    mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ select: mockSelect });
  });

  it("devuelve la lista de jugadores directamente de la RPC cuando responde exitosamente", async () => {
    const players = [
      { id: "p1", nombre: "Carlos Alcaraz" },
      { id: "p2", nombre: "Jannik Sinner" },
    ];
    mockRpc.mockResolvedValue({ data: players, error: null });

    const result = await listPlayers("org-123");

    expect(result).toEqual(players);
    expect(mockRpc).toHaveBeenCalledWith("rewards_list_players", {
      p_organizador_id: "org-123",
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("considera válida una lista vacía [] devuelta por la RPC sin ejecutar fallback a la tabla", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const result = await listPlayers("org-empty");

    expect(result).toEqual([]);
    expect(mockRpc).toHaveBeenCalledWith("rewards_list_players", {
      p_organizador_id: "org-empty",
    });
    // Verificación crítica: NUNCA debe consultar riviera_jugadores cuando la RPC responde []
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("propaga el error de permisos 42501 de la RPC sin ejecutar consultas alternativas", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "permission denied for function rewards_list_players",
      },
    });

    await expect(listPlayers("org-unauthorized")).rejects.toThrow(
      /permission denied for function rewards_list_players/
    );
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("propaga errores de autenticación (401 / JWT / Unauthorized) sin ejecutar consultas alternativas", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "PGRST301",
        message: "JWT expired",
      },
    });

    await expect(listPlayers("org-expired")).rejects.toThrow(/JWT expired/);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("NO ejecuta fallback ante un HTTP 404 genérico que no sea PGRST202 o 42883", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        status: 404,
        code: "NOT_FOUND",
        message: "Ruta no encontrada en el gateway",
      },
    });

    await expect(listPlayers("org-generic-404")).rejects.toThrow(
      /Ruta no encontrada en el gateway/
    );
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("NO ejecuta fallback ante errores de red o fallo de conexión", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        message: "TypeError: Failed to fetch",
      },
    });

    await expect(listPlayers("org-network-err")).rejects.toThrow(
      /Failed to fetch/
    );
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("ejecuta el fallback a riviera_jugadores exclusivamente si la RPC no existe (PGRST202)", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "PGRST202",
        message: "Could not find the function public.rewards_list_players in the schema cache",
      },
    });

    const fallbackPlayers = [{ id: "fb-1", nombre: "Jugador Fallback" }];
    mockOrder.mockResolvedValue({ data: fallbackPlayers, error: null });

    const result = await listPlayers("org-legacy");

    expect(result).toEqual(fallbackPlayers);
    expect(mockFrom).toHaveBeenCalledWith("riviera_jugadores");
    expect(mockSelect).toHaveBeenCalledWith("id, nombre");
    expect(mockEq).toHaveBeenCalledWith("organizador_id", "org-legacy");
    expect(mockOrder).toHaveBeenCalledWith("nombre", { ascending: true });
  });

  it("NO ejecuta fallback ante un error 42883 originado internamente dentro de una RPC existente", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "42883",
        message: "function assert_club_active(uuid) does not exist",
      },
    });

    await expect(listPlayers("org-internal-helper-missing")).rejects.toThrow(
      /function assert_club_active\(uuid\) does not exist/
    );
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("NO ejecuta fallback si el error 42883 menciona rewards_list_players en el stack o contexto pero la función faltante es otra", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "42883",
        message:
          "function assert_club_active(uuid) does not exist; PL/pgSQL function rewards_list_players(uuid) line 4 at SQL statement",
      },
    });

    await expect(listPlayers("org-stack-mention")).rejects.toThrow(
      /function assert_club_active\(uuid\) does not exist/
    );
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockFrom).not.toHaveBeenCalled();
  });


  it("ejecuta el fallback a riviera_jugadores si el error 42883 refiere expresamente a la ausencia de rewards_list_players", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "42883",
        message: "function public.rewards_list_players(uuid) does not exist",
      },
    });

    mockOrder.mockResolvedValue({ data: [], error: null });

    const result = await listPlayers("org-legacy-2");

    expect(result).toEqual([]);
    expect(mockFrom).toHaveBeenCalledWith("riviera_jugadores");
  });

  it("falla si tanto la RPC inexistente como la consulta de fallback devuelven error", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "42883",
        message: "function rewards_list_players does not exist",
      },
    });

    mockOrder.mockResolvedValue({
      data: null,
      error: { message: "Error al consultar riviera_jugadores" },
    });

    await expect(listPlayers("org-error")).rejects.toThrow(
      /Error al consultar riviera_jugadores/
    );
  });
});


