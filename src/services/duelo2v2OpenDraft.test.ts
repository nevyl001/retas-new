import {
  ensureDuelo2v2OpenDraft,
  createDuelo2v2OpenDraft,
} from "./duelo2v2Service";

const mockFrom = jest.fn();
const mockGetUser = jest.fn();

jest.mock("../lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

describe("ensureDuelo2v2OpenDraft idempotencia", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: "org-1" } },
      error: null,
    });
  });

  it("reutiliza duelo en configuracion existente", async () => {
    const existing = {
      id: "duelo-1",
      organizador_id: "org-1",
      nombre: "Viejo",
      descripcion: null,
      cancha: "1",
      programado_en: null,
      programado_hasta: null,
      estado: "configuracion",
      pareja_a_j1_id: null,
      pareja_a_j2_id: null,
      pareja_a_j1_nombre: "",
      pareja_a_j2_nombre: "",
      pareja_b_j1_id: null,
      pareja_b_j2_id: null,
      pareja_b_j1_nombre: "",
      pareja_b_j2_nombre: "",
      sets_pareja_a: 0,
      sets_pareja_b: 0,
      detalle_sets: [],
      ganador: null,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
      finalizado_at: null,
    };

    mockFrom.mockImplementation((table: string) => {
      if (table !== "duelos_2v2") throw new Error(table);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: existing, error: null }),
          }),
        }),
        update: () => ({
          eq: () => ({
            select: () => ({
              single: async () => ({
                data: { ...existing, nombre: "Nuevo nombre" },
                error: null,
              }),
            }),
          }),
        }),
        insert: jest.fn(),
      };
    });

    const result = await ensureDuelo2v2OpenDraft({
      existingId: "duelo-1",
      input: { nombre: "Nuevo nombre", cancha: "1" },
    });
    expect(result.id).toBe("duelo-1");
    expect(result.nombre).toBe("Nuevo nombre");
    expect(result.estado).toBe("configuracion");
  });

  it("createDuelo2v2OpenDraft no inicia marcador", async () => {
    mockFrom.mockImplementation(() => ({
      insert: (payload: Record<string, unknown>) => {
        expect(payload.estado).toBe("configuracion");
        expect(payload.pareja_a_j1_id).toBeNull();
        expect(payload.sets_pareja_a).toBe(0);
        return {
          select: () => ({
            single: async () => ({
              data: {
                id: "new-1",
                organizador_id: "org-1",
                ...payload,
                created_at: "2026-01-01",
                updated_at: "2026-01-01",
                finalizado_at: null,
                ganador: null,
                detalle_sets: [],
              },
              error: null,
            }),
          }),
        };
      },
    }));

    const d = await createDuelo2v2OpenDraft({
      nombre: "Open",
      cancha: "2",
    });
    expect(d.estado).toBe("configuracion");
    expect(d.pareja_a_j1_id).toBeNull();
  });
});
