import { ensureRivieraIdentity } from "./careerIdentity";

const mockRpc = jest.fn();

jest.mock("../supabaseClient", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

const BASE_PAYLOAD = {
  official_player_key: "key-1111-1111-1111-111111111111",
  riviera_id: "RIV-00000042",
  riviera_id_serial: 42,
  riviera_jugador_id: "jugador-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  registration_jugador_id: "jugador-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  debut_organizer_id: "org-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  debut_at: "2024-03-15T10:00:00.000Z",
  link_source: "owner",
  identity_created: true,
  link_created: true,
  riviera_id_assigned: true,
  debut_assigned: true,
};

describe("ensureRivieraIdentity", () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it("delega en RPC ensure_riviera_identity", async () => {
    mockRpc.mockResolvedValue({ data: BASE_PAYLOAD, error: null });

    await ensureRivieraIdentity(BASE_PAYLOAD.riviera_jugador_id);

    expect(mockRpc).toHaveBeenCalledWith("ensure_riviera_identity", {
      p_riviera_jugador_id: BASE_PAYLOAD.riviera_jugador_id,
    });
  });

  it("dos llamadas al mismo jugador devuelven la misma identidad (idempotencia RPC)", async () => {
    mockRpc.mockResolvedValue({ data: BASE_PAYLOAD, error: null });

    const first = await ensureRivieraIdentity(BASE_PAYLOAD.riviera_jugador_id);
    const second = await ensureRivieraIdentity(BASE_PAYLOAD.riviera_jugador_id);

    expect(first?.officialPlayerKey).toBe(second?.officialPlayerKey);
    expect(first?.rivieraId).toBe(second?.rivieraId);
    expect(first?.rivieraId).toBe("RIV-00000042");
  });

  it("un jugador conserva un solo Riviera ID en respuestas sucesivas", async () => {
    mockRpc
      .mockResolvedValueOnce({
        data: { ...BASE_PAYLOAD, identity_created: true, riviera_id_assigned: true },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ...BASE_PAYLOAD,
          identity_created: false,
          link_created: false,
          riviera_id_assigned: false,
          debut_assigned: false,
        },
        error: null,
      });

    const created = await ensureRivieraIdentity(BASE_PAYLOAD.riviera_jugador_id);
    const reused = await ensureRivieraIdentity(BASE_PAYLOAD.riviera_jugador_id);

    expect(created?.rivieraId).toBe("RIV-00000042");
    expect(reused?.rivieraId).toBe("RIV-00000042");
    expect(reused?.identityCreated).toBe(false);
    expect(reused?.rivieraIdAssigned).toBe(false);
  });

  it("debut y Organizador de Registro no cambian en re-ensure", async () => {
    mockRpc.mockResolvedValue({
      data: {
        ...BASE_PAYLOAD,
        identity_created: false,
        debut_assigned: false,
      },
      error: null,
    });

    const a = await ensureRivieraIdentity(BASE_PAYLOAD.riviera_jugador_id);
    const b = await ensureRivieraIdentity(BASE_PAYLOAD.riviera_jugador_id);

    expect(a?.debutOrganizerId).toBe("org-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    expect(b?.debutOrganizerId).toBe(a?.debutOrganizerId);
    expect(a?.debutAt).toBe("2024-03-15T10:00:00.000Z");
    expect(b?.debutAt).toBe(a?.debutAt);
  });

  it("cedido reutiliza official_player_key del origen (contrato RPC)", async () => {
    const grantedPayload = {
      ...BASE_PAYLOAD,
      riviera_jugador_id: "local-cccc-cccc-cccc-cccccccccccc",
      registration_jugador_id: "origin-dddd-dddd-dddd-dddddddddddd",
      link_source: "granted_local",
      identity_created: false,
      link_created: true,
    };
    mockRpc.mockResolvedValue({ data: grantedPayload, error: null });

    const result = await ensureRivieraIdentity(grantedPayload.riviera_jugador_id);

    expect(result?.officialPlayerKey).toBe(BASE_PAYLOAD.official_player_key);
    expect(result?.rivieraId).toBe("RIV-00000042");
    expect(result?.linkSource).toBe("granted_local");
    expect(result?.registrationJugadorId).toBe("origin-dddd-dddd-dddd-dddddddddddd");
  });

  it("retorna null con id vacío sin llamar RPC", async () => {
    const result = await ensureRivieraIdentity("  ");
    expect(result).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("propaga error de RPC", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "Sin permiso" },
    });

    await expect(
      ensureRivieraIdentity(BASE_PAYLOAD.riviera_jugador_id)
    ).rejects.toEqual({ message: "Sin permiso" });
  });
});
