import { supabase } from "../supabaseClient";
import {
  registrarParticipacionConLedger,
  actualizarParticipacionConLedger,
} from "./rivieraJugadoresService";

// jest.mock se "hoistea" automáticamente por encima de los imports de arriba
// (babel-plugin-jest-hoist) — evita el conflicto con la regla import/first.
jest.mock("../supabaseClient", () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
  },
  supabasePublicRead: {
    rpc: jest.fn(),
    from: jest.fn(),
  },
}));

const mockRpc = supabase.rpc as jest.Mock;

describe("registrarParticipacionConLedger — registro local + ledger global atómico (BLK-04)", () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it("éxito completo: una sola llamada RPC, devuelve el id de participación", async () => {
    mockRpc.mockResolvedValue({
      data: {
        ok: true,
        participacion_id: "part-1",
        ledger: { status: "inserted", ledger_id: "ledger-1" },
      },
      error: null,
    });

    const id = await registrarParticipacionConLedger({
      jugadorId: "j1",
      tipoEvento: "reta",
      eventoId: "e1",
      eventoNombre: "Reta X",
      resultado: "victoria",
      puntosObtenidos: 10,
    });

    expect(id).toBe("part-1");
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith(
      "registrar_participacion_jugador_con_ledger",
      expect.objectContaining({
        p_jugador_id: "j1",
        p_tipo_evento: "reta",
        p_evento_id: "e1",
        p_puntos_obtenidos: 10,
      })
    );
  });

  it("falla la escritura (RPC completa revierte ambas tablas): propaga el error, no hay escritura parcial", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "constraint violation en ledger" },
    });

    await expect(
      registrarParticipacionConLedger({
        jugadorId: "j1",
        tipoEvento: "reta",
        eventoId: "e1",
        eventoNombre: "Reta X",
        resultado: "victoria",
        puntosObtenidos: 10,
      })
    ).rejects.toMatchObject({ message: "constraint violation en ledger" });

    // Una sola llamada de red -- no hay un segundo paso que pudiera haber
    // completado antes del fallo.
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it("request duplicado (reintento tras timeout): mismo resultado en la respuesta (idempotencia heredada de ON CONFLICT)", async () => {
    mockRpc.mockResolvedValue({
      data: {
        ok: true,
        participacion_id: "part-1",
        ledger: { status: "already_exists" },
      },
      error: null,
    });

    const first = await registrarParticipacionConLedger({
      jugadorId: "j1",
      tipoEvento: "reta",
      eventoId: "e1",
      eventoNombre: "Reta X",
      resultado: "victoria",
      puntosObtenidos: 10,
    });
    const second = await registrarParticipacionConLedger({
      jugadorId: "j1",
      tipoEvento: "reta",
      eventoId: "e1",
      eventoNombre: "Reta X",
      resultado: "victoria",
      puntosObtenidos: 10,
    });

    expect(first).toBe("part-1");
    expect(second).toBe("part-1");
  });

  it("tabla/RPC no disponible (entorno sin migrar): no lanza, devuelve null", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST205", message: "relation does not exist" },
    });

    const id = await registrarParticipacionConLedger({
      jugadorId: "j1",
      tipoEvento: "reta",
      eventoId: "e1",
      eventoNombre: "Reta X",
      resultado: "victoria",
      puntosObtenidos: 10,
    });

    expect(id).toBeNull();
  });

  it("dos clubes distintos: cada llamada envía su propio jugador/evento sin mezclarse", async () => {
    mockRpc.mockResolvedValue({
      data: { ok: true, participacion_id: "part-a" },
      error: null,
    });

    await registrarParticipacionConLedger({
      jugadorId: "jugador-club-a",
      tipoEvento: "americano",
      eventoId: "evento-club-a",
      eventoNombre: "Americano A",
      resultado: "victoria",
      puntosObtenidos: 5,
      metadata: { organizador_id: "club-a" },
    });

    mockRpc.mockResolvedValue({
      data: { ok: true, participacion_id: "part-b" },
      error: null,
    });

    await registrarParticipacionConLedger({
      jugadorId: "jugador-club-b",
      tipoEvento: "americano",
      eventoId: "evento-club-b",
      eventoNombre: "Americano B",
      resultado: "derrota",
      puntosObtenidos: 0,
      metadata: { organizador_id: "club-b" },
    });

    expect(mockRpc).toHaveBeenNthCalledWith(
      1,
      "registrar_participacion_jugador_con_ledger",
      expect.objectContaining({ p_jugador_id: "jugador-club-a" })
    );
    expect(mockRpc).toHaveBeenNthCalledWith(
      2,
      "registrar_participacion_jugador_con_ledger",
      expect.objectContaining({ p_jugador_id: "jugador-club-b" })
    );
  });
});

describe("actualizarParticipacionConLedger — corrección local + ledger global atómica (BLK-04)", () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it("éxito completo: una sola llamada RPC", async () => {
    mockRpc.mockResolvedValue({
      data: { ok: true, participacion_id: "part-1" },
      error: null,
    });

    await actualizarParticipacionConLedger({
      participacionId: "part-1",
      eventoNombre: "Reta X (corregida)",
      resultado: "victoria",
      setsFavor: 6,
      setsContra: 2,
      puntosObtenidos: 15,
      metadata: { subtipo: "reta_cierre" },
    });

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith(
      "actualizar_participacion_jugador_con_ledger",
      expect.objectContaining({
        p_participacion_id: "part-1",
        p_puntos_obtenidos: 15,
      })
    );
  });

  it("participación inexistente o de otro organizador: no lanza, solo advierte (respeta el ok:false del RPC)", async () => {
    mockRpc.mockResolvedValue({
      data: { ok: false, error: "not_found" },
      error: null,
    });

    await expect(
      actualizarParticipacionConLedger({
        participacionId: "no-existe",
        eventoNombre: "X",
        resultado: "victoria",
        setsFavor: 0,
        setsContra: 0,
        puntosObtenidos: 0,
        metadata: {},
      })
    ).resolves.toBeUndefined();
  });

  it("error de red/RPC: propaga el error (no hay escritura parcial que ocultar)", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "network error" },
    });

    await expect(
      actualizarParticipacionConLedger({
        participacionId: "part-1",
        eventoNombre: "X",
        resultado: "victoria",
        setsFavor: 0,
        setsContra: 0,
        puntosObtenidos: 0,
        metadata: {},
      })
    ).rejects.toMatchObject({ message: "network error" });
  });
});
