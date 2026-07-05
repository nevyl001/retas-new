import {
  acceptPlayerSharingRequest,
  createPlayerSharingRequest,
  listIncomingPlayerSharingRequests,
  listOutgoingPlayerSharingRequests,
  parsePlayerSharingRequest,
  rejectPlayerSharingRequest,
} from "./playerSharingRequests";

const mockRpc = jest.fn();

jest.mock("../supabaseClient", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

const BASE_REQUEST = {
  id: "req-1111-1111-1111-111111111111",
  riviera_jugador_id: "jugador-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  registration_jugador_id: "jugador-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  requester_organizer_id: "hack-org-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  registration_organizer_id: "riviera-org-cccc-cccc-cccc-cccccccccccc",
  status: "pending",
  request_message: "Queremos inscribirlo en liga",
  decision_note: null,
  decided_by: null,
  created_at: "2026-03-01T12:00:00.000Z",
  decided_at: null,
  jugador_nombre: "Aaron Duran",
  riviera_id: "RIV-00000042",
};

describe("parsePlayerSharingRequest", () => {
  it("parsea solicitud completa", () => {
    const parsed = parsePlayerSharingRequest(BASE_REQUEST);
    expect(parsed?.id).toBe(BASE_REQUEST.id);
    expect(parsed?.status).toBe("pending");
    expect(parsed?.rivieraId).toBe("RIV-00000042");
    expect(parsed?.registrationOrganizerId).toBe(
      BASE_REQUEST.registration_organizer_id
    );
  });

  it("rechaza payload inválido", () => {
    expect(parsePlayerSharingRequest(null)).toBeNull();
    expect(parsePlayerSharingRequest({ id: "x" })).toBeNull();
  });
});

describe("createPlayerSharingRequest", () => {
  beforeEach(() => mockRpc.mockReset());

  it("delega en RPC create_player_sharing_request", async () => {
    mockRpc.mockResolvedValue({ data: BASE_REQUEST, error: null });

    await createPlayerSharingRequest(
      BASE_REQUEST.riviera_jugador_id,
      "mensaje"
    );

    expect(mockRpc).toHaveBeenCalledWith("create_player_sharing_request", {
      p_riviera_jugador_id: BASE_REQUEST.riviera_jugador_id,
      p_message: "mensaje",
    });
  });
});

describe("listOutgoingPlayerSharingRequests", () => {
  beforeEach(() => mockRpc.mockReset());

  it("lista solicitudes enviadas", async () => {
    mockRpc.mockResolvedValue({ data: [BASE_REQUEST], error: null });

    const rows = await listOutgoingPlayerSharingRequests("pending");

    expect(mockRpc).toHaveBeenCalledWith("list_outgoing_player_sharing_requests", {
      p_status: "pending",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("pending");
  });
});

describe("listIncomingPlayerSharingRequests", () => {
  beforeEach(() => mockRpc.mockReset());

  it("lista bandeja del Organizador de Registro", async () => {
    mockRpc.mockResolvedValue({ data: [BASE_REQUEST], error: null });

    const rows = await listIncomingPlayerSharingRequests();

    expect(mockRpc).toHaveBeenCalledWith("list_incoming_player_sharing_requests", {
      p_status: null,
    });
    expect(rows[0]?.jugadorNombre).toBe("Aaron Duran");
  });
});

describe("respondPlayerSharingRequest", () => {
  beforeEach(() => mockRpc.mockReset());

  it("aceptar registra estado accepted sin implicar acceso", async () => {
    mockRpc.mockResolvedValue({
      data: {
        ...BASE_REQUEST,
        status: "accepted",
        decided_at: "2026-03-02T10:00:00.000Z",
        decided_by: BASE_REQUEST.registration_organizer_id,
      },
      error: null,
    });

    const result = await acceptPlayerSharingRequest(BASE_REQUEST.id);

    expect(mockRpc).toHaveBeenCalledWith("respond_player_sharing_request", {
      p_request_id: BASE_REQUEST.id,
      p_accept: true,
      p_decision_note: null,
    });
    expect(result.status).toBe("accepted");
    expect(result.decidedAt).toBeTruthy();
  });

  it("rechazar registra estado rejected", async () => {
    mockRpc.mockResolvedValue({
      data: {
        ...BASE_REQUEST,
        status: "rejected",
        decision_note: "No disponible esta temporada",
        decided_at: "2026-03-02T10:00:00.000Z",
      },
      error: null,
    });

    const result = await rejectPlayerSharingRequest(
      BASE_REQUEST.id,
      "No disponible esta temporada"
    );

    expect(result.status).toBe("rejected");
    expect(result.decisionNote).toBe("No disponible esta temporada");
  });

  it("idempotencia de identidad: dos respuestas sobre misma solicitud la RPC rechaza (contrato)", async () => {
    mockRpc.mockResolvedValueOnce({
      data: { ...BASE_REQUEST, status: "accepted", decided_at: "2026-03-02T10:00:00.000Z" },
      error: null,
    });
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "La solicitud ya fue decidida" },
    });

    await acceptPlayerSharingRequest(BASE_REQUEST.id);
    await expect(acceptPlayerSharingRequest(BASE_REQUEST.id)).rejects.toEqual({
      message: "La solicitud ya fue decidida",
    });
  });
});

describe("inmutabilidad debut / registro (contrato de datos)", () => {
  it("registration_jugador_id y registration_organizer_id se preservan en respuesta", () => {
    const accepted = parsePlayerSharingRequest({
      ...BASE_REQUEST,
      status: "accepted",
      decided_at: "2026-03-02T10:00:00.000Z",
    });

    expect(accepted?.registrationJugadorId).toBe(
      BASE_REQUEST.registration_jugador_id
    );
    expect(accepted?.registrationOrganizerId).toBe(
      BASE_REQUEST.registration_organizer_id
    );
    expect(accepted?.rivieraId).toBe("RIV-00000042");
  });
});
