import { supabase } from "../lib/supabaseClient";
import {
  encolarBienvenidaTrasInscripcion,
  esEsquemaAusente,
  establecerCorreoVerificado,
  solicitarBienvenidaJugador,
  solicitarVerificacionCorreo,
  simulacionNotificacionesClienteActiva,
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

  it("no escribe una verificación de correo que el administrador no puede acreditar", async () => {
    await expect(
      establecerCorreoVerificado({
        ligaId: "liga",
        jugadorId: "jugador",
        rivieraJugadorId: null,
        verificado: true,
      })
    ).resolves.toEqual({ ok: false, motivo: "correo_sin_verificacion" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("no conserva un motivo que no sea un código", async () => {
    rpc.mockResolvedValue({
      data: { ok: false, encolado: false, motivo: "ana@example.com" },
      error: null,
    });
    const resultado = await solicitarBienvenidaJugador("liga", "jugador");
    expect(resultado.motivo).toBe("no_disponible");
  });

  it("ignora enlace_simulado si el build de cliente no autoriza simulación", async () => {
    expect(simulacionNotificacionesClienteActiva()).toBe(false);
    rpc.mockResolvedValue({
      data: {
        ok: true,
        simulado: true,
        solicitud_id: "sol-1",
        enlace_simulado:
          "https://appriviera.rivieraopen.com/public/verificar-correo?t=" +
          "a".repeat(64),
      },
      error: null,
    });
    await expect(
      solicitarVerificacionCorreo({ ligaId: "liga", jugadorId: "jugador" })
    ).resolves.toEqual({
      ok: true,
      motivo: null,
      simulado: false,
      enlaceSimulado: null,
      solicitudId: "sol-1",
    });
  });
});
