import {
  addOrganizerMembershipByRivieraId,
  canDeleteGlobalPlayer,
  canLeaveOrganizerMembershipForJugador,
  canRemovePlayerFromCurrentClub,
  leaveOrganizerMembership,
  listOrganizerMemberships,
  normalizeRivieraIdInput,
  parseAddOrganizerMembershipResult,
  parseLeaveOrganizerMembershipResult,
  parseOrganizerMembershipRow,
  parseRivieraIdResolveResult,
  removePlayerFromCurrentClub,
  resolvePlayerByRivieraId,
  resolvePlayerHomeOrganizadorId,
} from "./playerMembership";
import type { RivieraJugadorWithStats } from "./types";

const mockRpc = jest.fn();

jest.mock("../supabaseClient", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

const RESOLVE_FOUND = {
  found: true,
  riviera_id: "RIV-00000042",
  display_name: "Aaron Test",
  registration_organizer_id: "org-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  already_member: false,
  local_jugador_id: null,
  membership_id: null,
};

const ADD_RESULT = {
  membership_id: "mem-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  local_jugador_id: "local-cccc-cccc-cccc-cccccccccccc",
  source_jugador_id: "source-dddd-dddd-dddd-dddddddddddd",
  riviera_id: "RIV-00000042",
  display_name: "Aaron Test",
  registration_organizer_id: "org-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  created: true,
  reactivated: false,
  already_member: false,
  profile_link_created: true,
};

const LEAVE_RESULT = {
  membership_id: "mem-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  local_jugador_id: "local-cccc-cccc-cccc-cccccccccccc",
  source_jugador_id: "source-dddd-dddd-dddd-dddddddddddd",
  left_at: "2026-07-05T18:00:00.000Z",
  joined_via: "riviera_id",
};

const LIST_ROW = {
  membership_id: "mem-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  source_jugador_id: "source-dddd-dddd-dddd-dddddddddddd",
  local_jugador_id: "local-cccc-cccc-cccc-cccccccccccc",
  riviera_id: "RIV-00000042",
  display_name: "Aaron Test",
  registration_organizer_id: "org-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  joined_at: "2026-07-01T12:00:00.000Z",
  joined_via: "riviera_id",
  access_type: "granted_by_admin",
  is_public_ranking: false,
};

describe("normalizeRivieraIdInput", () => {
  it("acepta formato exacto RIV-00000001", () => {
    expect(normalizeRivieraIdInput("RIV-00000001")).toBe("RIV-00000001");
    expect(normalizeRivieraIdInput("  RIV-00000042  ")).toBe("RIV-00000042");
  });

  it("rechaza búsqueda parcial o formatos inválidos", () => {
    expect(normalizeRivieraIdInput("RIV-1")).toBeNull();
    expect(normalizeRivieraIdInput("riv-00000001")).toBeNull();
    expect(normalizeRivieraIdInput("Aaron")).toBeNull();
    expect(normalizeRivieraIdInput("")).toBeNull();
  });
});

describe("parseRivieraIdResolveResult", () => {
  it("parsea resultado encontrado", () => {
    const parsed = parseRivieraIdResolveResult(RESOLVE_FOUND);
    expect(parsed?.found).toBe(true);
    expect(parsed?.rivieraId).toBe("RIV-00000042");
    expect(parsed?.displayName).toBe("Aaron Test");
    expect(parsed?.alreadyMember).toBe(false);
  });

  it("parsea not found", () => {
    const parsed = parseRivieraIdResolveResult({
      found: false,
      riviera_id: "RIV-00009999",
    });
    expect(parsed?.found).toBe(false);
    expect(parsed?.displayName).toBeNull();
  });
});

describe("resolvePlayerByRivieraId", () => {
  beforeEach(() => mockRpc.mockReset());

  it("delega en RPC con Riviera ID normalizado", async () => {
    mockRpc.mockResolvedValue({ data: RESOLVE_FOUND, error: null });

    await resolvePlayerByRivieraId("  RIV-00000042  ");

    expect(mockRpc).toHaveBeenCalledWith("resolve_player_by_riviera_id", {
      p_riviera_id: "RIV-00000042",
    });
  });

  it("retorna null con formato inválido sin llamar RPC", async () => {
    const result = await resolvePlayerByRivieraId("invalid");
    expect(result).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("propaga error de RPC", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "Autenticación requerida" },
    });

    await expect(resolvePlayerByRivieraId("RIV-00000042")).rejects.toEqual({
      message: "Autenticación requerida",
    });
  });
});

describe("addOrganizerMembershipByRivieraId", () => {
  beforeEach(() => mockRpc.mockReset());

  it("delega en RPC add con id exacto", async () => {
    mockRpc.mockResolvedValue({ data: ADD_RESULT, error: null });

    const result = await addOrganizerMembershipByRivieraId("RIV-00000042");

    expect(mockRpc).toHaveBeenCalledWith(
      "add_organizer_membership_by_riviera_id",
      { p_riviera_id: "RIV-00000042" }
    );
    expect(result?.localJugadorId).toBe(ADD_RESULT.local_jugador_id);
    expect(result?.created).toBe(true);
  });

  it("idempotencia: already_member en segunda llamada", async () => {
    mockRpc.mockResolvedValue({
      data: {
        ...ADD_RESULT,
        created: false,
        reactivated: false,
        already_member: true,
        profile_link_created: false,
      },
      error: null,
    });

    const result = await addOrganizerMembershipByRivieraId("RIV-00000042");

    expect(result?.alreadyMember).toBe(true);
    expect(result?.rivieraId).toBe("RIV-00000042");
  });

  it("rechaza formato inválido antes de RPC", async () => {
    await expect(addOrganizerMembershipByRivieraId("RIV-42")).rejects.toThrow(
      "Riviera ID inválido"
    );
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("leaveOrganizerMembership / removePlayerFromCurrentClub", () => {
  beforeEach(() => mockRpc.mockReset());

  it("delega en RPC leave", async () => {
    mockRpc.mockResolvedValue({ data: LEAVE_RESULT, error: null });

    const result = await leaveOrganizerMembership(
      LEAVE_RESULT.local_jugador_id
    );

    expect(mockRpc).toHaveBeenCalledWith("leave_organizer_membership", {
      p_local_jugador_id: LEAVE_RESULT.local_jugador_id,
    });
    expect(result?.joinedVia).toBe("riviera_id");
    expect(parseLeaveOrganizerMembershipResult(LEAVE_RESULT)?.leftAt).toBe(
      LEAVE_RESULT.left_at
    );
  });

  it("removePlayerFromCurrentClub es alias de leaveOrganizerMembership", async () => {
    mockRpc.mockResolvedValue({ data: LEAVE_RESULT, error: null });

    await removePlayerFromCurrentClub(LEAVE_RESULT.local_jugador_id);

    expect(mockRpc).toHaveBeenCalledWith("leave_organizer_membership", {
      p_local_jugador_id: LEAVE_RESULT.local_jugador_id,
    });
  });

  it("retorna null con id vacío", async () => {
    expect(await leaveOrganizerMembership("  ")).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("listOrganizerMemberships", () => {
  beforeEach(() => mockRpc.mockReset());

  it("delega en RPC list y parsea filas", async () => {
    mockRpc.mockResolvedValue({ data: [LIST_ROW], error: null });

    const rows = await listOrganizerMemberships();

    expect(mockRpc).toHaveBeenCalledWith("list_organizer_memberships");
    expect(rows).toHaveLength(1);
    expect(parseOrganizerMembershipRow(LIST_ROW)?.joinedVia).toBe("riviera_id");
  });

  it("retorna array vacío si RPC devuelve null", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await listOrganizerMemberships()).toEqual([]);
  });
});

describe("parseAddOrganizerMembershipResult", () => {
  it("requiere campos obligatorios", () => {
    expect(parseAddOrganizerMembershipResult({ ...ADD_RESULT, riviera_id: 42 })).toBeNull();
    expect(parseAddOrganizerMembershipResult(ADD_RESULT)?.profileLinkCreated).toBe(true);
  });
});

describe("mapPlayerMembershipUiError", () => {
  it("traduce errores comunes de membership", async () => {
    const { mapPlayerMembershipUiError } = await import("./playerMembership");

    expect(
      mapPlayerMembershipUiError(new Error("Riviera ID no encontrado"))
    ).toMatch(/No encontramos un jugador/);

    expect(
      mapPlayerMembershipUiError(new Error("El jugador ya pertenece a tu organizador de registro"))
    ).toMatch(/organizador de registro/);

    expect(mapPlayerMembershipUiError({ message: "duplicate key" })).toMatch(
      /ya está en tu organizador/
    );

    expect(
      mapPlayerMembershipUiError(
        new Error("No puedes abandonar la membresía de registro del jugador")
      )
    ).toMatch(/pertenece a tu registro/);
  });
});

describe("canLeaveOrganizerMembershipForJugador", () => {
  const orgId = "org-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const ownerId = "org-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  it("permite baja cuando hay acceso concedido desde otro club", () => {
    expect(
      canLeaveOrganizerMembershipForJugador(
        {
          concedidoPorAdmin: true,
          grantedAccess: {
            accessId: "g1",
            sourceJugadorId: "src-1",
            ownerOrganizadorId: ownerId,
          },
          id: "local-clone",
          organizador_id: orgId,
        },
        orgId
      )
    ).toBe(true);
  });

  it("no permite baja del registro propio", () => {
    expect(
      canLeaveOrganizerMembershipForJugador(
        {
          concedidoPorAdmin: true,
          grantedAccess: {
            accessId: "g1",
            sourceJugadorId: "src-1",
            ownerOrganizadorId: orgId,
          },
          id: "native-1",
          organizador_id: orgId,
        },
        orgId
      )
    ).toBe(false);
  });

  it("no aplica a jugadores propios del registro", () => {
    expect(
      canLeaveOrganizerMembershipForJugador(
        {
          concedidoPorAdmin: false,
          id: "native-1",
          organizador_id: orgId,
        },
        orgId
      )
    ).toBe(false);
  });
});

function membershipJugador(
  partial: Partial<RivieraJugadorWithStats>
): RivieraJugadorWithStats {
  return {
    id: "local-clone",
    nombre: "Aaron",
    slug: "aaron",
    foto_url: null,
    email: null,
    telefono: null,
    whatsapp: null,
    nivel: "intermedio",
    categoria: "open",
    edad: null,
    mano_dominante: null,
    en_cancha: null,
    pais_codigo: null,
    instagram_url: null,
    facebook_url: null,
    tiktok_url: null,
    visible_publico: false,
    suma_ranking: true,
    genero: "M",
    fecha_nacimiento: null,
    club: null,
    organizador_id: "org-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    estado: "activo",
    legacy_player_id: null,
    legacy_liga_jugador_id: null,
    created_at: "",
    updated_at: "",
    rating: 3,
    rating_partidos: 0,
    rating_fiabilidad: 0.2,
    stats: null,
    ...partial,
  };
}

describe("remove vs delete global (Club A / Club B)", () => {
  const clubA = "org-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const clubB = "org-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const sourceId = "source-dddd-dddd-dddd-dddddddddddd";
  const localB = "local-cccc-cccc-cccc-cccccccccccc";

  const importedAtB = membershipJugador({
    id: localB,
    organizador_id: clubB,
    concedidoPorAdmin: true,
    grantedAccess: {
      accessId: "grant-1",
      sourceJugadorId: sourceId,
      ownerOrganizadorId: clubA,
    },
  });

  it("Club B puede quitar jugador importado por Riviera ID", () => {
    expect(canRemovePlayerFromCurrentClub(importedAtB, clubB)).toBe(true);
    expect(canDeleteGlobalPlayer(importedAtB, clubB)).toBe(false);
  });

  it("Club B NO puede borrar jugador global", () => {
    expect(canDeleteGlobalPlayer(importedAtB, clubB)).toBe(false);
  });

  it("Club A conserva eliminación global para jugador nativo", () => {
    const nativeAtA = membershipJugador({
      id: sourceId,
      organizador_id: clubA,
      concedidoPorAdmin: false,
    });
    expect(canRemovePlayerFromCurrentClub(nativeAtA, clubA)).toBe(false);
    expect(canDeleteGlobalPlayer(nativeAtA, clubA)).toBe(true);
  });

  it("tras quitar en B el jugador sigue existiendo en A (contrato de permisos)", () => {
    const nativeAtA = membershipJugador({
      id: sourceId,
      organizador_id: clubA,
      concedidoPorAdmin: false,
    });
    expect(resolvePlayerHomeOrganizadorId(nativeAtA)).toBe(clubA);
    expect(canDeleteGlobalPlayer(nativeAtA, clubA)).toBe(true);
    expect(canRemovePlayerFromCurrentClub(importedAtB, clubB)).toBe(true);
  });

  it("cedido sin ownerOrganizadorId pero con clon local distinto al source", () => {
    const row = membershipJugador({
      id: localB,
      organizador_id: clubB,
      concedidoPorAdmin: true,
      grantedAccess: {
        accessId: "grant-2",
        sourceJugadorId: sourceId,
      },
    });
    expect(canRemovePlayerFromCurrentClub(row, clubB)).toBe(true);
  });
});
