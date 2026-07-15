/**
 * createRivieraJugador es el punto único de escritura de producto para dar
 * de alta un jugador NUEVO (NuevoJugadorModal, AccountControlsPanel). Estos
 * tests verifican que el correo sea obligatorio por default (trim +
 * lowercase + formato), y que el fallback interno de sync/import
 * (skipEmailRequirement) preserve el comportamiento histórico sin exigirlo.
 */
import { supabase } from "../supabaseClient";
import { createRivieraJugador } from "./rivieraJugadoresService";
import {
  EMAIL_INVALID_MESSAGE,
  EMAIL_REQUIRED_MESSAGE,
} from "./emailValidation";

// jest.mock se hoistea automáticamente por encima de los imports (Jest +
// babel-plugin-jest-hoist), así que escribirlo después de los imports es
// equivalente en tiempo de ejecución y respeta la regla import/first.
jest.mock("../supabaseClient", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

const ORG = "11111111-1111-4111-8111-111111111111";

/** Mock genérico: slug nunca existe, insert siempre exitoso, devuelve el payload insertado. */
function mockSupabaseForCreate() {
  let lastInsertPayload: Record<string, unknown> | null = null;

  (supabase.from as jest.Mock).mockImplementation(() => {
    const chain: Record<string, jest.Mock> = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.or = jest.fn().mockReturnValue(chain);
    // slugExistsForOrg: .select("id").eq(...).eq(...).maybeSingle()
    chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    chain.insert = jest.fn().mockImplementation((payload: Record<string, unknown>) => {
      lastInsertPayload = payload;
      const insertChain: Record<string, jest.Mock> = {};
      insertChain.select = jest.fn().mockReturnValue(insertChain);
      insertChain.single = jest.fn().mockResolvedValue({
        data: { id: "jugador-1", ...payload },
        error: null,
      });
      return insertChain;
    });
    return chain;
  });

  return {
    getLastInsertPayload: () => lastInsertPayload,
  };
}

describe("createRivieraJugador — correo obligatorio para altas nuevas", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("crea el jugador con correo válido y lo persiste normalizado", async () => {
    const { getLastInsertPayload } = mockSupabaseForCreate();

    const jugador = await createRivieraJugador(ORG, {
      nombre: "Jugador Nuevo",
      email: "jugador@example.com",
    });

    expect(jugador.id).toBe("jugador-1");
    expect(getLastInsertPayload()?.email).toBe("jugador@example.com");
    expect(supabase.from).toHaveBeenCalled();
  });

  it("rechaza sin correo — no llega a tocar supabase", async () => {
    mockSupabaseForCreate();

    await expect(
      createRivieraJugador(ORG, { nombre: "Sin Correo" })
    ).rejects.toThrow(EMAIL_REQUIRED_MESSAGE);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rechaza correo con solo espacios (equivalente a vacío)", async () => {
    mockSupabaseForCreate();

    await expect(
      createRivieraJugador(ORG, { nombre: "Espacios", email: "   " })
    ).rejects.toThrow(EMAIL_REQUIRED_MESSAGE);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rechaza correo con formato inválido — no llega a tocar supabase", async () => {
    mockSupabaseForCreate();

    await expect(
      createRivieraJugador(ORG, { nombre: "Correo Malo", email: "no-es-un-correo" })
    ).rejects.toThrow(EMAIL_INVALID_MESSAGE);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("aplica trim() al correo antes de guardarlo", async () => {
    const { getLastInsertPayload } = mockSupabaseForCreate();

    await createRivieraJugador(ORG, {
      nombre: "Con Espacios",
      email: "   jugador@example.com   ",
    });

    expect(getLastInsertPayload()?.email).toBe("jugador@example.com");
  });

  it("aplica lowercase() al correo antes de guardarlo", async () => {
    const { getLastInsertPayload } = mockSupabaseForCreate();

    await createRivieraJugador(ORG, {
      nombre: "Mayusculas",
      email: "Jugador@EXAMPLE.COM",
    });

    expect(getLastInsertPayload()?.email).toBe("jugador@example.com");
  });

  it("skipEmailRequirement (fallback interno de sync/import) permite crear sin correo", async () => {
    const { getLastInsertPayload } = mockSupabaseForCreate();

    const jugador = await createRivieraJugador(
      ORG,
      { nombre: "Historico Sin Correo", email: null },
      { skipEmailRequirement: true }
    );

    expect(jugador.id).toBe("jugador-1");
    expect(getLastInsertPayload()?.email).toBeNull();
  });
});
