import { createVirtualPair, updateVirtualPairLabel } from "./createVirtualPair";
import { supabase } from "./supabaseClient";

jest.mock("./supabaseClient", () => ({
  supabase: { from: jest.fn() },
  supabasePublicRead: {},
}));

const TOURNAMENT = "271dd1d2-1916-4bb1-8612-13b6e91c0fa0";
const PAIR = "ffff0000-0000-4000-8000-000000000099";

function mockPairs(result: { data?: unknown; error?: unknown }) {
  const tables: string[] = [];
  const insert = jest.fn();
  const update = jest.fn();
  const chain: {
    insert: jest.Mock;
    update: jest.Mock;
    select: jest.Mock;
    eq: jest.Mock;
    single: jest.Mock;
  } = {
    insert: jest.fn((payload: unknown) => {
      insert(payload);
      return chain;
    }),
    update: jest.fn((payload: unknown) => {
      update(payload);
      return chain;
    }),
    select: jest.fn(() => chain),
    eq: jest.fn(() => Promise.resolve({ error: result.error ?? null })),
    single: jest.fn().mockResolvedValue({
      data: result.data ?? null,
      error: result.error ?? null,
    }),
  };
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    tables.push(table);
    return chain;
  });
  return { tables, insert, update };
}

describe("createVirtualPair", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("inserta solo pairs, con ids nulos, is_virtual y el label", async () => {
    const mock = mockPairs({
      data: {
        id: PAIR,
        tournament_id: TOURNAMENT,
        is_virtual: true,
        virtual_label: "Pareja por definir 1",
        player1_id: null,
        player2_id: null,
        player1_name: null,
        player2_name: null,
      },
    });

    const created = await createVirtualPair({
      tournamentId: TOURNAMENT,
      virtualLabel: "  Pareja por definir 1  ",
    });

    expect(mock.tables).toEqual(["pairs"]);
    expect(mock.tables).not.toContain("players");
    expect(mock.tables).not.toContain("riviera_jugadores");
    expect(mock.insert).toHaveBeenCalledWith([
      {
        tournament_id: TOURNAMENT,
        is_virtual: true,
        virtual_label: "Pareja por definir 1",
        player1_id: null,
        player2_id: null,
        player1_name: null,
        player2_name: null,
      },
    ]);
    expect(created).toEqual({
      id: PAIR,
      tournament_id: TOURNAMENT,
      is_virtual: true,
      virtual_label: "Pareja por definir 1",
      player1_id: null,
      player2_id: null,
      player1_name: null,
      player2_name: null,
    });
  });

  it("rechaza un label vacío sin insertar", async () => {
    const mock = mockPairs({});
    await expect(
      createVirtualPair({ tournamentId: TOURNAMENT, virtualLabel: "   " })
    ).rejects.toThrow(/nombre/i);
    expect(mock.insert).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("renombrar solo escribe virtual_label", async () => {
    const mock = mockPairs({});
    await updateVirtualPairLabel(PAIR, " Clasificado Qualy ");
    expect(mock.tables).toEqual(["pairs"]);
    expect(mock.update).toHaveBeenCalledWith({
      virtual_label: "Clasificado Qualy",
    });
    expect(mock.insert).not.toHaveBeenCalled();
  });
});
