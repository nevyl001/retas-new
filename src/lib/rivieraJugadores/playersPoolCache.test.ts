import type { Player } from "../db/types";
import type { RivieraJugadorWithStats } from "./types";
import {
  buildRivieraListCacheKey,
  clearPlayersPoolCacheForTests,
  getCachedLegacyPlayersPool,
  getCachedRivieraJugadoresList,
  invalidatePlayersPool,
  setCachedLegacyPlayersPool,
  setCachedRivieraJugadoresList,
} from "./playersPoolCache";

function player(id: string, name: string): Player {
  return {
    id,
    name,
    email: `${id}@padel.local`,
    created_at: "2020-01-01",
  } as Player;
}

function jugador(id: string, nombre: string): RivieraJugadorWithStats {
  return {
    id,
    nombre,
    organizador_id: "org-1",
  } as RivieraJugadorWithStats;
}

describe("playersPoolCache", () => {
  beforeEach(() => {
    clearPlayersPoolCacheForTests();
  });

  it("devuelve el mismo conjunto y orden del pool legacy", () => {
    const list = [player("b", "Bea"), player("a", "Ana")];
    setCachedLegacyPlayersPool("org-1", list);
    const cached = getCachedLegacyPlayersPool("org-1");
    expect(cached?.map((p) => p.id)).toEqual(["b", "a"]);
    expect(cached?.map((p) => p.name)).toEqual(["Bea", "Ana"]);
  });

  it("no reutiliza caché de otro organizador", () => {
    setCachedLegacyPlayersPool("org-1", [player("a", "Ana")]);
    expect(getCachedLegacyPlayersPool("org-2")).toBeNull();
  });

  it("invalidatePlayersPool limpia pool y listas Riviera del org", () => {
    setCachedLegacyPlayersPool("org-1", [player("a", "Ana")]);
    const key = buildRivieraListCacheKey("org-1");
    expect(key).toBeTruthy();
    setCachedRivieraJugadoresList(key!, [jugador("j1", "Ana")]);

    invalidatePlayersPool("org-1");

    expect(getCachedLegacyPlayersPool("org-1")).toBeNull();
    expect(getCachedRivieraJugadoresList(key!)).toBeNull();
  });

  it("no cachea listados con search", () => {
    expect(
      buildRivieraListCacheKey("org-1", { search: "ana" })
    ).toBeNull();
  });

  it("cachea skipCareerEnrich como clave distinta", () => {
    const k1 = buildRivieraListCacheKey("org-1");
    const k2 = buildRivieraListCacheKey("org-1", { skipCareerEnrich: true });
    expect(k1).not.toEqual(k2);
    setCachedRivieraJugadoresList(k1!, [jugador("j1", "Ana")]);
    setCachedRivieraJugadoresList(k2!, [jugador("j2", "Luis")]);
    expect(getCachedRivieraJugadoresList(k1!)?.map((j) => j.id)).toEqual([
      "j1",
    ]);
    expect(getCachedRivieraJugadoresList(k2!)?.map((j) => j.id)).toEqual([
      "j2",
    ]);
  });
});
