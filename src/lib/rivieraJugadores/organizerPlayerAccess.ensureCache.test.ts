/**
 * Regresión Log Ingest 4 nov 2026: ensure de cesiones no puede releer
 * organizer_player_access y riviera_jugadores en cada cierre de carrera.
 */
/* eslint-disable import/first -- jest.mock debe preceder los imports que mockea */
jest.mock("../supabaseClient", () => ({
  supabase: { rpc: jest.fn(), from: jest.fn() },
  supabasePublicRead: { rpc: jest.fn(), from: jest.fn() },
}));

import { supabase } from "../supabaseClient";
import {
  ensureGrantedLocalPlayerSumsRanking,
  prepareGrantedPlayersForParticipacionSync,
  resetGrantedRankingEnsureCache,
} from "./organizerPlayerAccess";
/* eslint-enable import/first */

function maybeSingleChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, jest.Mock> = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.maybeSingle = jest.fn().mockResolvedValue(result);
  return chain;
}

describe("ensureGrantedLocalPlayerSumsRanking — no relee si ya está bien", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetGrantedRankingEnsureCache();
  });

  it("la segunda llamada dentro del TTL no vuelve a consultar", async () => {
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === "organizer_player_access") {
        return maybeSingleChain({
          data: { is_public_ranking: false },
          error: null,
        });
      }
      return maybeSingleChain({
        data: { suma_ranking: true, visible_publico: true, estado: "activo" },
        error: null,
      });
    });

    await ensureGrantedLocalPlayerSumsRanking("org-1", "local-1");
    await ensureGrantedLocalPlayerSumsRanking("org-1", "local-1");

    expect(supabase.from).toHaveBeenCalledTimes(2);
  });

  it("dos llamadas simultáneas comparten la lectura", async () => {
    let release: (value: unknown) => void = () => undefined;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      const chain: Record<string, jest.Mock> = {};
      chain.select = jest.fn().mockReturnValue(chain);
      chain.eq = jest.fn().mockReturnValue(chain);
      chain.maybeSingle = jest.fn().mockImplementation(() =>
        gate.then(() =>
          table === "organizer_player_access"
            ? { data: { is_public_ranking: false }, error: null }
            : {
                data: {
                  suma_ranking: true,
                  visible_publico: true,
                  estado: "activo",
                },
                error: null,
              }
        )
      );
      return chain;
    });

    const pending = Promise.all([
      ensureGrantedLocalPlayerSumsRanking("org-1", "local-2"),
      ensureGrantedLocalPlayerSumsRanking("org-1", "local-2"),
    ]);
    release(undefined);
    await pending;

    expect(supabase.from).toHaveBeenCalledTimes(2);
  });
});

describe("prepareGrantedPlayersForParticipacionSync — una pasada en vuelo", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetGrantedRankingEnsureCache();
  });

  it("dos prepares simultáneos del mismo club comparten la lista de cesiones", async () => {
    let release: (value: unknown) => void = () => undefined;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    (supabase.from as jest.Mock).mockImplementation(() => {
      const chain: Record<string, jest.Mock> = {};
      chain.select = jest.fn().mockReturnValue(chain);
      let eqs = 0;
      chain.eq = jest.fn().mockImplementation(() => {
        eqs += 1;
        if (eqs >= 2) {
          return gate.then(() => ({ data: [], error: null }));
        }
        return chain;
      });
      return chain;
    });

    const pending = Promise.all([
      prepareGrantedPlayersForParticipacionSync("org-1"),
      prepareGrantedPlayersForParticipacionSync("org-1"),
    ]);
    expect(supabase.from).toHaveBeenCalledTimes(1);
    release(undefined);
    await expect(pending).resolves.toEqual([[], []]);
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });
});
