jest.mock("../supabaseClient", () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
  },
}));

import { supabase } from "../supabaseClient";
import {
  archiveRetaResults,
  buildIncompleteArchivePrompt,
  decideSafeMatchDeletion,
  ensureArchivedBeforeMatchDelete,
  fetchRetaArchiveStatus,
  formatArchiveFailures,
} from "./retaArchiveApi";

const RETA_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("retaArchiveApi", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("archiveRetaResults invoca reta-archive-proxy con action archive", async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: {
        retaId: RETA_ID,
        total: 2,
        archived: 2,
        complete: true,
        canDeleteMatches: true,
        failures: [],
        updated: 2,
        alreadyArchived: 0,
        failed: 0,
        errors: [],
      },
      error: null,
    });

    const summary = await archiveRetaResults(RETA_ID);
    expect(supabase.functions.invoke).toHaveBeenCalledWith("reta-archive-proxy", {
      body: { retaId: RETA_ID, action: "archive", force: false },
    });
    expect(summary.canDeleteMatches).toBe(true);
  });

  it("fetchRetaArchiveStatus invoca reta-archive-proxy con action status", async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValue({
      data: {
        retaId: RETA_ID,
        total: 1,
        archived: 1,
        complete: true,
        canDeleteMatches: true,
        failures: [],
      },
      error: null,
    });

    await fetchRetaArchiveStatus(RETA_ID);
    expect(supabase.functions.invoke).toHaveBeenLastCalledWith("reta-archive-proxy", {
      body: { retaId: RETA_ID, action: "status" },
    });
  });

  it("ensureArchivedBeforeMatchDelete archiva y luego consulta status", async () => {
    (supabase.functions.invoke as jest.Mock)
      .mockResolvedValueOnce({
        data: { retaId: RETA_ID, canDeleteMatches: true, failures: [] },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          retaId: RETA_ID,
          total: 1,
          archived: 1,
          complete: true,
          canDeleteMatches: true,
          failures: [],
        },
        error: null,
      });

    const status = await ensureArchivedBeforeMatchDelete(RETA_ID);
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(2);
    expect(status.canDeleteMatches).toBe(true);
  });

  it("formatArchiveFailures lista cada failure", () => {
    const text = formatArchiveFailures({
      retaId: RETA_ID,
      total: 1,
      archived: 0,
      complete: false,
      canDeleteMatches: false,
      failures: [
        {
          participacionId: "p1",
          jugadorId: "j1",
          jugadorNombre: "Ana",
          reason: "missing_legacy_player_id",
          message: "Sin legacy id",
        },
      ],
    });
    expect(text).toContain("Ana");
    expect(text).toContain("missing_legacy_player_id");
  });

  it("buildIncompleteArchivePrompt incluye conteo y pregunta de confirmación", () => {
    const prompt = buildIncompleteArchivePrompt(
      {
        retaId: RETA_ID,
        total: 4,
        archived: 2,
        complete: false,
        canDeleteMatches: false,
        failures: [],
      },
      3
    );
    expect(prompt).toContain("Archivados: 2/4");
    expect(prompt).toContain("3 partido(s) finalizado(s)");
  });

  it("decideSafeMatchDeletion procede si canDeleteMatches es true", async () => {
    (supabase.functions.invoke as jest.Mock)
      .mockResolvedValueOnce({ data: {}, error: null })
      .mockResolvedValueOnce({
        data: {
          retaId: RETA_ID,
          total: 2,
          archived: 2,
          complete: true,
          canDeleteMatches: true,
          failures: [],
        },
        error: null,
      });

    const confirm = jest.fn();
    const result = await decideSafeMatchDeletion(RETA_ID, 2, confirm);
    expect(result.proceed).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("decideSafeMatchDeletion cancela si archivado incompleto y usuario rechaza", async () => {
    (supabase.functions.invoke as jest.Mock)
      .mockResolvedValueOnce({ data: {}, error: null })
      .mockResolvedValueOnce({
        data: {
          retaId: RETA_ID,
          total: 2,
          archived: 0,
          complete: false,
          canDeleteMatches: false,
          failures: [
            {
              participacionId: "p1",
              jugadorId: "j1",
              reason: "update_failed",
              message: "falló",
            },
          ],
        },
        error: null,
      });

    const confirm = jest.fn().mockReturnValue(false);
    const result = await decideSafeMatchDeletion(RETA_ID, 2, confirm);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(result.proceed).toBe(false);
    expect(result.warning).toContain("cancelada");
  });

  it("decideSafeMatchDeletion procede con warning si usuario confirma archivado incompleto", async () => {
    (supabase.functions.invoke as jest.Mock)
      .mockResolvedValueOnce({ data: {}, error: null })
      .mockResolvedValueOnce({
        data: {
          retaId: RETA_ID,
          total: 2,
          archived: 1,
          complete: false,
          canDeleteMatches: false,
          failures: [],
        },
        error: null,
      });

    const confirm = jest.fn().mockReturnValue(true);
    const result = await decideSafeMatchDeletion(RETA_ID, 2, confirm);
    expect(result.proceed).toBe(true);
    expect(result.warning).toContain("incompleto");
  });
});
