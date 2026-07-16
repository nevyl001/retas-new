import {
  findPoolPlayerByLegacyId,
  hintWhenRegistryPlayerMissingFromRetaPool,
} from "./registrySelectForReta";

describe("registrySelectForReta", () => {
  it("encuentra en pool solo por legacy_player_id (no por nombre)", () => {
    const pool = [
      { id: "legacy-a", name: "Yusuke" },
      { id: "legacy-b", name: "Yusuke" },
    ];
    expect(findPoolPlayerByLegacyId(pool, "legacy-b")?.id).toBe("legacy-b");
    expect(findPoolPlayerByLegacyId(pool, "missing")).toBeUndefined();
    expect(findPoolPlayerByLegacyId(pool, null)).toBeUndefined();
  });

  it("con legacy_player_id pide Actualizar, no «créalo»", () => {
    const hint = hintWhenRegistryPlayerMissingFromRetaPool({
      rivieraJugadorId: "rj-1",
      legacyPlayerId: "legacy-1",
      isGranted: false,
    });
    expect(hint.suggestRefresh).toBe(true);
    expect(hint.message.toLowerCase()).not.toMatch(/cr[eé]alo/);
    expect(hint.message).toMatch(/Actualizar/i);
  });

  it("concedido sin legacy: no dice créalo; reconoce que ya pertenece al club", () => {
    const hint = hintWhenRegistryPlayerMissingFromRetaPool({
      rivieraJugadorId: "rj-yusuke",
      legacyPlayerId: null,
      isGranted: true,
    });
    expect(hint.message.toLowerCase()).not.toMatch(/cr[eé]alo/);
    expect(hint.message).toMatch(/concedido|pertenece/i);
    expect(hint.suggestRefresh).toBe(true);
  });
});
