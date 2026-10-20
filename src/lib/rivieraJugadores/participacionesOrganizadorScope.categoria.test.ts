import { enrichParticipacionesOrganizadorFromEvents } from "./participacionesOrganizadorScope";
import type { JugadorParticipacion } from "./types";

const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock("../supabaseClient", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
  supabasePublicRead: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

const T4 = "9baa803d-7fb4-4a60-90a9-5faf4870c16b";
const T5 = "8ea4bdeb-80b0-4830-8235-8b8fa1fe0726";
const TM = "1fed3f28-2fe0-4b08-b080-a7121f88a7f4";
const ORG = "e724de97-3552-4a01-a269-f621e6f1ed26";

function part(
  id: string,
  eventoId: string,
  metadata: Record<string, unknown>,
  tipo: JugadorParticipacion["tipo_evento"] = "torneo_express"
): JugadorParticipacion {
  return {
    id,
    jugador_id: "j1",
    tipo_evento: tipo,
    evento_id: eventoId,
    evento_nombre: "Hack Padel Fest",
    pareja_con: null,
    resultado: "participación",
    sets_favor: 0,
    sets_contra: 0,
    puntos_obtenidos: 50,
    metadata,
    fecha: "2026-07-08",
    created_at: "2026-07-08T00:00:00Z",
  };
}

function mockTorneoExpressRows(rows: Array<{ id: string; categoria: string | null }>) {
  const inMock = jest.fn().mockResolvedValue({ data: rows, error: null });
  const selectMock = jest.fn().mockReturnValue({ in: inMock });
  mockFrom.mockReturnValue({ select: selectMock });
  return { inMock, selectMock };
}

describe("enrichParticipacionesOrganizadorFromEvents — categoría de torneo", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockRpc.mockReset();
  });

  it("recupera categorías históricas aunque exista organizador_id, con una sola consulta", async () => {
    const { inMock, selectMock } = mockTorneoExpressRows([
      { id: T4, categoria: "4ta Fuerza" },
      { id: T5, categoria: "5ta Fuerza" },
      { id: TM, categoria: "Mixtos D" },
    ]);

    const input = [
      part("a", T4, { organizador_id: ORG, lugar: "Participación" }),
      part("b", T5, { organizador_id: ORG, lugar: "2do lugar" }),
      part("c", TM, { organizador_id: ORG, lugar: "1er lugar" }),
    ];
    const out = await enrichParticipacionesOrganizadorFromEvents(input);

    expect(out.map((r) => r.metadata?.categoria)).toEqual([
      "4ta Fuerza",
      "5ta Fuerza",
      "Mixtos D",
    ]);
    // Sin N+1: una sola consulta con los 3 ids.
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith("torneo_express");
    expect(selectMock).toHaveBeenCalledWith("id, categoria");
    expect(inMock).toHaveBeenCalledTimes(1);
    expect(inMock.mock.calls[0][1]).toEqual(expect.arrayContaining([T4, T5, TM]));
    // No se tocan organizador_id ni otros metadatos / puntos.
    expect(out[1].metadata).toMatchObject({ organizador_id: ORG, lugar: "2do lugar" });
    expect(out[1].puntos_obtenidos).toBe(50);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("no consulta ni sobrescribe cuando metadata.categoria ya existe", async () => {
    mockTorneoExpressRows([{ id: T4, categoria: "Otra" }]);
    const input = [part("a", T4, { organizador_id: ORG, categoria: "4ta Fuerza" })];
    const out = await enrichParticipacionesOrganizadorFromEvents(input);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(out[0]).toBe(input[0]);
  });

  it("solo enriquece torneo_express (ligas/retas/americanos intactos)", async () => {
    mockTorneoExpressRows([{ id: T4, categoria: "4ta Fuerza" }]);
    const input = [
      part("a", T4, { organizador_id: ORG }, "liga"),
      part("b", T4, { organizador_id: ORG }, "reta"),
      part("c", T4, { organizador_id: ORG }, "americano"),
    ];
    const out = await enrichParticipacionesOrganizadorFromEvents(input);
    expect(mockFrom).not.toHaveBeenCalled();
    out.forEach((r, i) => expect(r).toBe(input[i]));
  });

  it("si el torneo no tiene categoría, deja el registro sin cambios", async () => {
    mockTorneoExpressRows([{ id: T4, categoria: null }]);
    const input = [part("a", T4, { organizador_id: ORG })];
    const out = await enrichParticipacionesOrganizadorFromEvents(input);
    expect(out[0].metadata?.categoria).toBeUndefined();
  });
});
