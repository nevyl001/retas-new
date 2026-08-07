/**
 * fetchOrganizadorAccountSettings — casos A/B/C de DEFAULT vs fila real.
 * Solo valida logging/comportamiento; no toca BD.
 */
/* eslint-disable import/first -- jest.mock debe ir antes de imports (patrón del repo) */
jest.mock("../supabaseClient", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from "../supabaseClient";
import { fetchOrganizadorAccountSettings } from "./accountControls";
import { DEFAULT_ORGANIZADOR_GAME_MODES } from "./organizadorGameModes";
/* eslint-enable import/first */

const fromMock = supabase.from as jest.Mock;

function mockMaybeSingle(result: {
  data: unknown;
  error: { code?: string; message?: string } | null;
}) {
  const maybeSingle = jest.fn().mockResolvedValue(result);
  const eq = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq });
  fromMock.mockReturnValue({ select });
}

describe("fetchOrganizadorAccountSettings fallbacks", () => {
  const orgId = "35e31ab8-2a2f-4526-9e84-e130c85f8ca9";
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    fromMock.mockReset();
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("A: fila existente → configuración real (sin DEFAULT warning)", async () => {
    mockMaybeSingle({
      data: {
        organizador_id: orgId,
        reta_equipos: false,
        round_robin: false,
        americano: false,
        mini_torneo: true,
        liga: false,
        duelo_2v2: false,
        permite_ajuste_puntos_manuales: true,
        visible_ranking_oficial: false,
        premium_branding_enabled: true,
        branding_key: "padel-court-series",
      },
      error: null,
    });

    const settings = await fetchOrganizadorAccountSettings(orgId);
    expect(settings.modes["mini-torneo"]).toBe(true);
    expect(settings.modes["round-robin"]).toBe(false);
    expect(settings.modes["duelo-2v2"]).toBe(false);
    expect(settings.premiumBrandingEnabled).toBe(true);
    expect(settings.brandingKey).toBe("padel-court-series");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("B: fila inexistente → DEFAULT + warning explícito", async () => {
    mockMaybeSingle({ data: null, error: null });

    const settings = await fetchOrganizadorAccountSettings(orgId);
    expect(settings.modes["round-robin"]).toBe(
      DEFAULT_ORGANIZADOR_GAME_MODES.round_robin
    );
    expect(settings.modes["duelo-2v2"]).toBe(
      DEFAULT_ORGANIZADOR_GAME_MODES.duelo_2v2
    );
    expect(settings.modes["mini-torneo"]).toBe(
      DEFAULT_ORGANIZADOR_GAME_MODES.mini_torneo
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "[admin] fetchOrganizadorAccountSettings: DEFAULT por fila inexistente",
      { organizadorId: orgId }
    );
  });

  it("C: error de consulta → DEFAULT + warning distinto", async () => {
    mockMaybeSingle({
      data: null,
      error: { code: "PGRST301", message: "JWT expired" },
    });

    const settings = await fetchOrganizadorAccountSettings(orgId);
    expect(settings.modes["round-robin"]).toBe(true);
    expect(settings.modes["duelo-2v2"]).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      "[admin] fetchOrganizadorAccountSettings: DEFAULT por error de consulta",
      expect.objectContaining({
        organizadorId: orgId,
        code: "PGRST301",
      })
    );
  });
});
