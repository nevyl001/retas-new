import { supabase } from "../supabaseClient";
import {
  listJugadoresForAdmin,
  updateJugadorAdminControlsForOrganizer,
  bulkUpdateJugadoresAdminControlsForOrganizer,
} from "./accountControls";

jest.mock("../supabaseClient", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

jest.mock("../rivieraJugadores/playersPoolCache", () => ({
  invalidatePlayersPool: jest.fn(),
}));

function listChain(rows: unknown[]) {
  const chain: Record<string, jest.Mock> = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockResolvedValue({ data: rows, error: null });
  return chain;
}

describe("publicación oficial del directorio", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("un cedido con ficha local apagada queda publicado si la identidad global ya lo está", async () => {
    (supabase.from as jest.Mock).mockReturnValue(
      listChain([
        {
          id: "local-1",
          nombre: "Alex Reyes",
          slug: "alex",
          categoria: "5ta_fuerza",
          estado: "activo",
          visible_publico: false,
          suma_ranking: true,
          created_at: "2026-01-01",
          stats: { puntos_totales: 255 },
        },
      ])
    );
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: [
        {
          jugador_id: "local-1",
          riviera_id: "RIV-00001234",
          es_cedido: true,
          publicado_global: true,
          publicacion_propia: false,
          origen_organizador_id: "origen",
          origen_nombre: "Hack Pádel",
          conflicto: false,
          puede_publicar: false,
          puede_retirar: false,
          motivo_bloqueo: "Ya publicado en sitio oficial.",
        },
      ],
      error: null,
    });

    const rows = await listJugadoresForAdmin("club-receptor");
    expect(rows[0].visible_publico).toBe(true);
    expect(rows[0].publicacion.esCedido).toBe(true);
    expect(rows[0].publicacion.rivieraId).toBe("RIV-00001234");
    expect(rows[0].publicacion.puedePublicar).toBe(false);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "admin_directorio_publicacion_oficial",
      { p_organizador_id: "club-receptor" }
    );
  });

  it("publicar llama al servidor y no escribe visible_publico en la ficha local", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: {
        ok: true,
        code: "ya_publicado",
        publicado: true,
        perfil_publicado_id: "canon",
        origen_nombre: "Hack Pádel",
        organizador_publicado_id: "origen",
      },
      error: null,
    });

    const result = await updateJugadorAdminControlsForOrganizer("club", "local-1", {
      visible_publico: true,
    });

    expect(result?.code).toBe("ya_publicado");
    expect(supabase.rpc).toHaveBeenCalledWith("admin_set_publicacion_oficial", {
      p_organizador_id: "club",
      p_jugador_id: "local-1",
      p_publicar: true,
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("si la migración no está aplicada, no publica por la tabla", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: null,
      error: {
        code: "PGRST202",
        message: "admin_set_publicacion_oficial does not exist",
      },
    });

    await expect(
      updateJugadorAdminControlsForOrganizer("club", "local-1", {
        visible_publico: true,
      })
    ).rejects.toThrow(/migración de publicación oficial/);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("la acción masiva usa una sola RPC y conserva el conteo de ya publicados", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: {
        ok: true,
        publicados: 0,
        ya_publicados: 2,
        retirados: 0,
        conflictos: 1,
        bloqueados: 0,
        no_autorizados: 0,
      },
      error: null,
    });

    const result = await bulkUpdateJugadoresAdminControlsForOrganizer(
      "club",
      ["a", "b", "c"],
      { visible_publico: true }
    );

    expect(result.yaPublicados).toBe(2);
    expect(result.conflictos).toBe(1);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "admin_set_publicacion_oficial_masiva",
      {
        p_organizador_id: "club",
        p_jugador_ids: ["a", "b", "c"],
        p_publicar: true,
      }
    );
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
