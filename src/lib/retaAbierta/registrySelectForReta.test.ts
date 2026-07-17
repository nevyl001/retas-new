import {
  findPoolPlayerByLegacyId,
  hintWhenRegistryPlayerMissingFromRetaPool,
  messageForRegistryLegacyLinkFailure,
  registryLegacyLinkUiAfterError,
} from "./registrySelectForReta";
import { LegacyLinkUnverifiableError } from "./linkLegacyOnSelectForReta";

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

  it("C — error LegacyLinkUnverifiableError: UI no continúa ni crea player", () => {
    const err = new LegacyLinkUnverifiableError(
      "El perfil local ya tiene un vínculo legacy, pero no puede verificarse bajo la sesión actual. No se modificó el vínculo.",
      "legacy_link_unverifiable"
    );
    const ui = registryLegacyLinkUiAfterError(err);
    expect(ui.selectPlayer).toBe(false);
    expect(ui.createPlayerFallback).toBe(false);
    expect(ui.nameLookupFallback).toBe(false);
    expect(ui.clearLoading).toBe(true);
    expect(ui.errorCode).toBe("legacy_link_unverifiable");
    expect(ui.hint).toMatch(/no se modificó el vínculo/i);
    expect(messageForRegistryLegacyLinkFailure(err)).toBe(err.message);
  });

  it("C — RIVIERA_SOURCE_LEGACY_CROSS_ORG y LOCAL: mensaje + fail-closed UI", () => {
    const sourceErr = new LegacyLinkUnverifiableError(
      "El perfil origen apunta a un players de este club (daño cross-org). No se modificó ningún vínculo.",
      "RIVIERA_SOURCE_LEGACY_CROSS_ORG"
    );
    const localErr = new LegacyLinkUnverifiableError(
      "El vínculo legacy del perfil local apunta a un players de otro club. No se modificó el vínculo.",
      "RIVIERA_LOCAL_LEGACY_CROSS_ORG"
    );
    expect(registryLegacyLinkUiAfterError(sourceErr)).toMatchObject({
      selectPlayer: false,
      createPlayerFallback: false,
      nameLookupFallback: false,
      clearLoading: true,
      errorCode: "RIVIERA_SOURCE_LEGACY_CROSS_ORG",
    });
    expect(registryLegacyLinkUiAfterError(localErr)).toMatchObject({
      selectPlayer: false,
      createPlayerFallback: false,
      clearLoading: true,
      errorCode: "RIVIERA_LOCAL_LEGACY_CROSS_ORG",
    });
  });
});
