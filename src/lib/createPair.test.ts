import { createPair } from "./database";
import { supabase } from "./supabaseClient";

jest.mock("./supabaseClient", () => ({
  supabase: {
    from: jest.fn(),
  },
  supabasePublicRead: {},
}));

type Chain = {
  select: jest.Mock;
  eq: jest.Mock;
  single: jest.Mock;
  insert: jest.Mock;
};

function mockPlayersThenInsert(opts: {
  insertError?: { code: string; message: string; details?: string; hint?: string } | null;
  insertData?: Record<string, unknown> | null;
}) {
  const from = supabase.from as jest.Mock;
  let call = 0;

  from.mockImplementation((table: string) => {
    if (table === "players") {
      const name = call === 0 ? "Devyl" : "Duran";
      call += 1;
      const chain: Chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { name },
          error: null,
        }),
        insert: jest.fn(),
      };
      return chain;
    }

    if (table === "pairs") {
      const insertChain: Chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: opts.insertData ?? {
            id: "pair-1",
            tournament_id: "271dd1d2-1916-4bb1-8612-13b6e91c0fa0",
            player1_id: "9a3798d5-bc2f-4b15-b17c-e35b8eedae1f",
            player2_id: "0dd76f7e-b306-4ed8-85f8-100aeceb775b",
            player1_name: "Devyl",
            player2_name: "Duran",
          },
          error: opts.insertError ?? null,
        }),
        insert: jest.fn().mockReturnThis(),
      };
      // insert().select().single()
      insertChain.insert.mockReturnValue(insertChain);
      insertChain.select.mockReturnValue(insertChain);
      return insertChain;
    }

    throw new Error(`unexpected table ${table}`);
  });
}

describe("createPair", () => {
  const T = "271dd1d2-1916-4bb1-8612-13b6e91c0fa0";
  const P1 = "9a3798d5-bc2f-4b15-b17c-e35b8eedae1f";
  const P2 = "0dd76f7e-b306-4ed8-85f8-100aeceb775b";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("forma pareja con una sola llamada a insert", async () => {
    mockPlayersThenInsert({});
    await createPair(T, P1, P2, "user-should-not-be-in-payload");

    const pairsCalls = (supabase.from as jest.Mock).mock.calls.filter(
      (c) => c[0] === "pairs"
    );
    expect(pairsCalls).toHaveLength(1);

    const pairsChain = (supabase.from as jest.Mock).mock.results.find(
      (_r, i) => (supabase.from as jest.Mock).mock.calls[i][0] === "pairs"
    )?.value;
    expect(pairsChain.insert).toHaveBeenCalledTimes(1);
    const payload = pairsChain.insert.mock.calls[0][0][0];
    expect(payload).toEqual({
      tournament_id: T,
      player1_id: P1,
      player2_id: P2,
      player1_name: "Devyl",
      player2_name: "Duran",
    });
    expect(payload.user_id).toBeUndefined();
  });

  it("no ejecuta fallback duplicado ante error", async () => {
    mockPlayersThenInsert({
      insertError: {
        code: "PGRST204",
        message: "Could not find the 'user_id' column of 'pairs' in the schema cache",
      },
    });

    await expect(createPair(T, P1, P2, "org")).rejects.toMatchObject({
      code: "PGRST204",
    });

    const pairsChain = (supabase.from as jest.Mock).mock.results.find(
      (_r, i) => (supabase.from as jest.Mock).mock.calls[i][0] === "pairs"
    )?.value;
    expect(pairsChain.insert).toHaveBeenCalledTimes(1);
  });

  it("error 400 no se interpreta como éxito", async () => {
    mockPlayersThenInsert({
      insertError: {
        code: "23503",
        message: "foreign key violation",
        details: "Key is not present",
        hint: "",
      },
    });

    await expect(createPair(T, P1, P2)).rejects.toBeTruthy();
  });

  it("éxito agrega una sola pareja (una fila)", async () => {
    mockPlayersThenInsert({
      insertData: {
        id: "only-one",
        tournament_id: T,
        player1_id: P1,
        player2_id: P2,
      },
    });
    const data = await createPair(T, P1, P2);
    expect(data.id).toBe("only-one");
  });

  it("rechaza payload inválido sin insert", async () => {
    const from = supabase.from as jest.Mock;
    from.mockImplementation(() => {
      throw new Error("no debería consultar si ids inválidos");
    });
    await expect(
      createPair("", P1, P2)
    ).rejects.toThrow();
  });
});
