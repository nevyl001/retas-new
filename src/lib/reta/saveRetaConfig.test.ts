const mockRpc = jest.fn();
const mockFrom = jest.fn();
const mockGetSession = jest.fn();

jest.mock("../supabaseClient", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

jest.mock("../database", () => ({
  getTournamentPublicConfigExtended: jest.fn(async () => null),
}));

jest.mock("../roundRobinChampionship", () => {
  const actual = jest.requireActual("../roundRobinChampionship");
  return {
    ...actual,
    saveChampionshipConfig: jest.fn(),
    initChampionshipConfig: jest.fn(),
    saveChampionshipConfigLocalOnly: jest.fn(),
  };
});

import type { Match, Tournament } from "../db/types";
import { saveRetaConfig, tournamentToFormValues } from "./updateRetaConfig";

const baseTournament: Tournament = {
  id: "t1",
  name: "Reta A",
  description: "desc",
  courts: 4,
  is_started: true,
  is_finished: false,
  user_id: "u1",
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-01T12:00:00.000Z",
  format: "round_robin",
};

function pending(court: number, id: string): Match {
  return {
    id,
    tournament_id: "t1",
    pair1_id: "p1",
    pair2_id: "p2",
    pair1_name: "A",
    pair2_name: "B",
    court,
    status: "pending",
    created_at: "2026-07-01T00:00:00.000Z",
  };
}

describe("saveRetaConfig — atomic courts + optimistic lock", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "tok" } },
      error: null,
    });
  });

  it("sesión ausente: no escribe y pide re-login (no falso conflicto)", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    const values = tournamentToFormValues(baseTournament);
    values.name = "Nuevo";
    const result = await saveRetaConfig({
      tournament: baseTournament,
      matches: [],
      phase: "draft",
      values,
      loadedUpdatedAt: baseTournament.updated_at,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.sessionExpired).toBe(true);
      expect(result.error).toMatch(/sesión expiró/i);
      expect(result.conflict).toBeFalsy();
    }
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("7. sin confirmación de reducción no llama RPC", async () => {
    const values = tournamentToFormValues(baseTournament);
    values.courts = 2;
    const result = await saveRetaConfig({
      tournament: baseTournament,
      matches: [pending(3, "m1"), pending(4, "m2")],
      phase: "in_play",
      values,
      loadedUpdatedAt: baseTournament.updated_at,
      courtsDecreaseConfirmed: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.needsCourtsConfirm).toBeTruthy();
    }
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("8/11. conflicto updated_at en RPC no guarda courts (ok:false conflict)", async () => {
    mockRpc.mockResolvedValue({
      data: {
        ok: false,
        error: "conflict",
        message:
          "La configuración cambió en otra sesión. Recarga los datos antes de guardar.",
      },
      error: null,
    });
    const values = tournamentToFormValues(baseTournament);
    values.courts = 2;
    const result = await saveRetaConfig({
      tournament: baseTournament,
      matches: [pending(3, "m1")],
      phase: "in_play",
      values,
      loadedUpdatedAt: baseTournament.updated_at,
      courtsDecreaseConfirmed: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflict).toBe(true);
      expect(result.error).toMatch(/otra sesión/);
    }
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("11b. dos versiones concurrentes: loadedUpdatedAt ≠ tournament.updated_at", async () => {
    const values = tournamentToFormValues(baseTournament);
    values.name = "Nuevo";
    const result = await saveRetaConfig({
      tournament: {
        ...baseTournament,
        updated_at: "2026-07-01T13:00:00.000Z",
      },
      matches: [],
      phase: "draft",
      values,
      loadedUpdatedAt: "2026-07-01T12:00:00.000Z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflict).toBe(true);
    }
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("10. double-save: segundo con mismo expected tras éxito usa nuevo updated_at", async () => {
    mockRpc.mockResolvedValue({
      data: {
        ok: true,
        courts: 2,
        unassigned_count: 1,
        updated_at: "2026-07-01T12:30:00.000Z",
      },
      error: null,
    });
    const values = tournamentToFormValues(baseTournament);
    values.courts = 2;
    const first = await saveRetaConfig({
      tournament: baseTournament,
      matches: [pending(3, "m1")],
      phase: "in_play",
      values,
      loadedUpdatedAt: baseTournament.updated_at,
      courtsDecreaseConfirmed: true,
    });
    expect(first.ok).toBe(true);

    mockRpc.mockResolvedValue({
      data: {
        ok: false,
        error: "conflict",
        message:
          "La configuración cambió en otra sesión. Recarga los datos antes de guardar.",
      },
      error: null,
    });
    const second = await saveRetaConfig({
      tournament: baseTournament,
      matches: [pending(3, "m1")],
      phase: "in_play",
      values,
      loadedUpdatedAt: baseTournament.updated_at,
      courtsDecreaseConfirmed: true,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.conflict).toBe(true);
  });

  it("12. fallo conserva valores del formulario (caller no muta values)", async () => {
    mockRpc.mockResolvedValue({
      data: { ok: false, error: "forbidden" },
      error: null,
    });
    const values = tournamentToFormValues(baseTournament);
    values.courts = 2;
    values.name = "Intentado";
    const snapshot = JSON.stringify(values);
    const result = await saveRetaConfig({
      tournament: baseTournament,
      matches: [pending(4, "m1")],
      phase: "in_play",
      values,
      loadedUpdatedAt: baseTournament.updated_at,
      courtsDecreaseConfirmed: true,
    });
    expect(JSON.stringify(values)).toBe(snapshot);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.sessionExpired).toBe(true);
      expect(result.error).toMatch(/sesión expiró/i);
    }
  });

  it("updated_at equivalente por instante no dispara falso conflicto", async () => {
    const values = tournamentToFormValues(baseTournament);
    values.name = "Nuevo";
    const chain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          ...baseTournament,
          name: "Nuevo",
          updated_at: "2026-07-01T12:00:00.000+00:00",
        },
        error: null,
      }),
    };
    mockFrom.mockReturnValue(chain);
    const result = await saveRetaConfig({
      tournament: {
        ...baseTournament,
        updated_at: "2026-07-01T12:00:00.000Z",
      },
      matches: [],
      phase: "draft",
      values,
      loadedUpdatedAt: "2026-07-01T12:00:00.000+00:00",
    });
    expect(result.ok).toBe(true);
  });

  it("4b. éxito reporta unassigned_count", async () => {
    mockRpc.mockResolvedValue({
      data: {
        ok: true,
        courts: 2,
        unassigned_count: 6,
        updated_at: "2026-07-01T12:05:00.000Z",
      },
      error: null,
    });
    const values = tournamentToFormValues(baseTournament);
    values.courts = 2;
    const result = await saveRetaConfig({
      tournament: baseTournament,
      matches: Array.from({ length: 6 }, (_, i) =>
        pending(3 + (i % 2), `m${i}`)
      ),
      phase: "in_play",
      values,
      loadedUpdatedAt: baseTournament.updated_at,
      courtsDecreaseConfirmed: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toMatch(/6 partido/);
      expect(result.tournament.courts).toBe(2);
    }
    expect(mockRpc).toHaveBeenCalledWith(
      "update_tournament_courts_and_unassign",
      expect.objectContaining({
        p_tournament_id: "t1",
        p_new_courts: 2,
        p_expected_updated_at: baseTournament.updated_at,
      })
    );
  });
});
