jest.mock("./supabaseClient", () => ({
  supabase: {
    from: jest.fn(),
    functions: { invoke: jest.fn() },
  },
}));

jest.mock("./retaArchive/retaArchiveApi", () => ({
  decideSafeMatchDeletion: jest.fn(),
}));

import { supabase } from "./supabaseClient";
import { decideSafeMatchDeletion } from "./retaArchive/retaArchiveApi";
import {
  deleteMatchesByTournament,
  deleteMatchesByTournamentSafely,
  getMatches,
} from "./database";

const TOURNAMENT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function mockMatchesTable(rows: Array<{ id: string; status: string }>) {
  const deleteEq = jest.fn().mockResolvedValue({ error: null });
  const deleteFn = jest.fn().mockReturnValue({ eq: deleteEq });
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    if (table !== "matches") {
      throw new Error(`unexpected table ${table}`);
    }
    return {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({ data: rows, error: null }),
        }),
      }),
      delete: deleteFn,
    };
  });
  return { deleteFn, deleteEq };
}

describe("deleteMatchesByTournamentSafely", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("noop si no hay partidos", async () => {
    mockMatchesTable([]);
    const result = await deleteMatchesByTournamentSafely(TOURNAMENT_ID, () => true);
    expect(result).toEqual({ outcome: "noop" });
    expect(decideSafeMatchDeletion).not.toHaveBeenCalled();
  });

  it("borra sin archivado si ningún partido está finished", async () => {
    const { deleteFn } = mockMatchesTable([
      { id: "m1", status: "pending" },
    ]);

    const result = await deleteMatchesByTournamentSafely(TOURNAMENT_ID, () => true);
    expect(decideSafeMatchDeletion).not.toHaveBeenCalled();
    expect(result.outcome).toBe("deleted");
    expect(deleteFn).toHaveBeenCalled();
  });

  it("cancela si archivado incompleto y usuario rechaza", async () => {
    mockMatchesTable([{ id: "m1", status: "finished" }]);
    (decideSafeMatchDeletion as jest.Mock).mockResolvedValue({
      proceed: false,
      warning: "Operación cancelada para preservar el detalle de partidos.",
    });

    const result = await deleteMatchesByTournamentSafely(
      TOURNAMENT_ID,
      () => false
    );
    expect(decideSafeMatchDeletion).toHaveBeenCalledWith(
      TOURNAMENT_ID,
      1,
      expect.any(Function)
    );
    expect(result).toEqual({
      outcome: "cancelled",
      warning: "Operación cancelada para preservar el detalle de partidos.",
    });
  });

  it("borra si archivado OK", async () => {
    const { deleteFn } = mockMatchesTable([{ id: "m1", status: "finished" }]);
    (decideSafeMatchDeletion as jest.Mock).mockResolvedValue({ proceed: true });

    const result = await deleteMatchesByTournamentSafely(TOURNAMENT_ID, () => true);
    expect(result.outcome).toBe("deleted");
    expect(deleteFn).toHaveBeenCalled();
  });
});

describe("getMatches / deleteMatchesByTournament", () => {
  it("getMatches está exportado para callers del scheduler", () => {
    expect(typeof getMatches).toBe("function");
    expect(typeof deleteMatchesByTournament).toBe("function");
  });
});
