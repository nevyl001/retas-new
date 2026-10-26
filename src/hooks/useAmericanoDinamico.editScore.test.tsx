import { renderHook, act } from "@testing-library/react";
import { useAmericanoDinamico } from "./useAmericanoDinamico";
import { persistAmericanoDinamicoMatchScore, loadAmericanoDinamicoSnapshotMerged, persistAmericanoNewRound } from "../lib/americanoDinamicoSync";

jest.mock("../lib/americanoDinamicoSync", () => {
  const actual = jest.requireActual("../lib/americanoDinamicoSync");
  return {
    ...actual,
    loadAmericanoDinamicoSnapshotMerged: jest.fn(async () => ({
      snapshot: null,
      source: "none",
      remoteAvailable: true,
    })),
    persistAmericanoDinamicoMatchScore: jest.fn(async () => ({
      status: "ok",
      snapshot: { version: 1, savedAt: "2026-01-01T00:00:00Z", ranking: [], rounds: [] },
    })),
    persistAmericanoNewRound: jest.fn(async () => ({ status: "created" })),
    resetAmericanoDinamicoRemote: jest.fn(async () => true),
  };
});

jest.mock("../lib/rivieraJugadores/aplicarRatingPartido", () => ({
  aplicarRatingAmericanoPartido: jest.fn(async () => true),
}));

const persist = persistAmericanoDinamicoMatchScore as jest.Mock;
const loadMerged = loadAmericanoDinamicoSnapshotMerged as jest.Mock;
const persistRound = persistAmericanoNewRound as jest.Mock;

const roster = [
  { id: "a1", name: "Ana" },
  { id: "a2", name: "Ana" },
  { id: "l1", name: "Luis" },
  { id: "m1", name: "María" },
];

describe("editScore americano", () => {
  beforeEach(() => {
    loadMerged.mockResolvedValue({
      snapshot: null,
      source: "none",
      remoteAvailable: true,
    });
    persistRound.mockResolvedValue({ status: "created" });
    persist.mockReset();
    persist.mockResolvedValue({
      status: "ok",
      snapshot: { version: 1, savedAt: "2026-01-01T00:00:00Z", ranking: [], rounds: [] },
    });
    localStorage.clear();
  });

  async function start() {
    const view = renderHook(() => useAmericanoDinamico("americano-edit-test"));
    act(() => {
      roster.forEach((player) => view.result.current.toggleExistingPlayer(player));
    });
    await act(async () => {
      await view.result.current.startTournament(1, 1);
    });
    return view;
  }

  it("no cambia el ranking si el servidor rechaza, y no duplica al corregir", async () => {
    const view = await start();
    const match = view.result.current.rounds[0].matches[0];
    act(() => {
      view.result.current.commitRoundScores([
        { matchId: match.id, scoreA: 6, scoreB: 4 },
      ]);
    });
    const before = view.result.current.ranking.find((p) =>
      match.teamA.some((player) => player.id === p.id)
    )?.stats.pointsFor;

    persist.mockResolvedValueOnce({ status: "error", message: "rechazado" });
    let rejected: { ok: boolean } = { ok: true };
    await act(async () => {
      rejected = await view.result.current.editScore(0, match.id, 1, 1);
    });
    expect(rejected.ok).toBe(false);
    const still = view.result.current.ranking.find((p) =>
      match.teamA.some((player) => player.id === p.id)
    )?.stats.pointsFor;
    expect(still).toBe(before);

    await act(async () => {
      const ok = await view.result.current.editScore(0, match.id, 2, 6);
      expect(ok.ok).toBe(true);
    });
    const corrected = view.result.current.rounds[0].matches[0];
    expect(corrected.scoreA).toBe(2);
    expect(corrected.scoreRevision?.previousScoreA).toBe(6);
    const owner = view.result.current.ranking.find(
      (p) => p.id === corrected.teamA[0].id
    );
    expect(owner?.stats.pointsFor).toBe(2);
    expect(owner?.stats.gamesPlayed).toBe(1);
  });

  it("restaura el marcador confirmado si hay conflicto", async () => {
    const view = await start();
    const match = view.result.current.rounds[0].matches[0];
    act(() => {
      view.result.current.commitRoundScores([
        { matchId: match.id, scoreA: 6, scoreB: 4 },
      ]);
    });
    persist.mockResolvedValueOnce({ status: "conflict", scoreA: 6, scoreB: 4 });
    await act(async () => {
      const result = await view.result.current.editScore(0, match.id, 0, 7);
      expect(result).toMatchObject({ ok: false, conflict: true });
    });
    expect(view.result.current.rounds[0].matches[0].scoreA).toBe(6);
    expect(view.result.current.rounds[0].matches[0].scoreRevision).toBeUndefined();
  });
});
