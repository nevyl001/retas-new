import { supabase } from "../lib/supabaseClient";
import {
  encolarBienvenidaTrasInscripcion,
  esEsquemaAusente,
  solicitarBienvenidaJugador,
} from "./ligaNotificacionesService";

jest.mock("../lib/supabaseClient", () => ({
  supabase: { rpc: jest.fn() },
}));

const rpc = supabase.rpc as jest.Mock;

describe("ligaNotificacionesService", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it("si la migración no está aplicada, la inscripción sigue sin lanzar", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "Could not find the function public.encolar_bienvenida_liga" },
    });

    await expect(
      encolarBienvenidaTrasInscripcion("liga", "jugador")
    ).resolves.toBeUndefined();
    expect(esEsquemaAusente("Could not find the function")).toBe(true);
    expect(rpc).toHaveBeenCalledWith("encolar_bienvenida_liga", {
      p_liga_id: "liga",
      p_liga_jugador_id: "jugador",
    });
  });

  it("un jugador no elegible no queda marcado como encolado", async () => {
    rpc.mockResolvedValue({
      data: { ok: false, encolado: false, motivo: "deshabilitado" },
      error: null,
    });
    await expect(solicitarBienvenidaJugador("liga", "jugador")).resolves.toEqual({
      ok: false,
      encolado: false,
      motivo: "deshabilitado",
    });
  });

  it("no conserva un motivo que no sea un código", async () => {
    rpc.mockResolvedValue({
      data: { ok: false, encolado: false, motivo: "ana@example.com" },
      error: null,
    });
    const resultado = await solicitarBienvenidaJugador("liga", "jugador");
    expect(resultado.motivo).toBe("no_disponible");
  });
});
