import { supabase } from "../lib/supabaseClient";
import { getPublicOrganizadorIdFromPath } from "../lib/rivieraJugadores/publicOrganizador";
import { clearTenantBranding, resolveAndApplyBranding } from "./BrandingService";
import {
  bootstrapAppBranding,
  isBrandingBootstrapDegraded,
  retryBrandingBootstrap,
} from "./bootstrapAppBranding";

// jest.mock se "hoistea" automáticamente por encima de los imports de arriba
// (babel-plugin-jest-hoist) — el orden fuente aquí no cambia el comportamiento,
// solo evita el conflicto con la regla de lint import/first.
jest.mock("../lib/supabaseClient", () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));

jest.mock("../lib/rivieraJugadores/publicOrganizador", () => ({
  getPublicOrganizadorIdFromPath: jest.fn(),
}));

jest.mock("./BrandingService", () => ({
  clearTenantBranding: jest.fn(),
  resolveAndApplyBranding: jest.fn(),
  applyBrandingSyncForOrganizador: jest.fn(),
}));

jest.mock("./documentMotherBrandPath", () => ({
  shouldKeepDocumentMotherBrand: jest.fn(() => false),
}));

const getSessionMock = supabase.auth.getSession as jest.Mock;
const getPathOrgMock = getPublicOrganizadorIdFromPath as jest.Mock;
const clearTenantBrandingMock = clearTenantBranding as jest.Mock;
const resolveAndApplyBrandingMock = resolveAndApplyBranding as jest.Mock;

describe("bootstrapAppBranding — nunca impide el primer render (BLK-01)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    getPathOrgMock.mockReturnValue(null);
    getSessionMock.mockResolvedValue({ data: { session: null } });
    resolveAndApplyBrandingMock.mockResolvedValue(undefined);
    window.history.pushState({}, "", "/");
  });

  it("con caché premium: aplica branding sync antes de getSession y no oculta la UI", async () => {
    window.localStorage.setItem(
      "ro_club_experience_v1",
      JSON.stringify({
        organizadorId: "35e31ab8-2a2f-4526-9e84-e130c85f8ca9",
        brandingKey: "padel-court-series",
      })
    );
    const { applyBrandingSyncForOrganizador } = jest.requireMock("./BrandingService");
    getSessionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () => resolve({ data: { session: { user: { id: "35e31ab8-2a2f-4526-9e84-e130c85f8ca9" } } } }),
            20
          );
        })
    );

    const pending = bootstrapAppBranding();
    expect(applyBrandingSyncForOrganizador).toHaveBeenCalledWith(
      "35e31ab8-2a2f-4526-9e84-e130c85f8ca9"
    );
    expect(document.documentElement.classList.contains("branding-transitioning")).toBe(
      false
    );
    await pending;
    window.localStorage.clear();
  });

  it("branding exitoso: resuelve sin marcar degraded y aplica el default (sin sesión)", async () => {
    await expect(bootstrapAppBranding()).resolves.toBeUndefined();
    expect(clearTenantBrandingMock).toHaveBeenCalledTimes(1);
    expect(isBrandingBootstrapDegraded()).toBe(false);
  });

  it("branding exitoso con sesión: resuelve el branding del organizador logueado", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: "org-1" } } },
    });
    await expect(bootstrapAppBranding()).resolves.toBeUndefined();
    expect(resolveAndApplyBrandingMock).toHaveBeenCalledWith("org-1");
    expect(isBrandingBootstrapDegraded()).toBe(false);
  });

  it("timeout de red: getSession rechaza pero bootstrapAppBranding() NUNCA lanza", async () => {
    getSessionMock.mockRejectedValue(new Error("timeout of 10000ms exceeded"));
    await expect(bootstrapAppBranding()).resolves.toBeUndefined();
    expect(clearTenantBrandingMock).toHaveBeenCalledTimes(1);
    expect(isBrandingBootstrapDegraded()).toBe(true);
  });

  it("Supabase sin conexión: getSession rechaza con error de red y se aplica el default", async () => {
    getSessionMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(bootstrapAppBranding()).resolves.toBeUndefined();
    expect(clearTenantBrandingMock).toHaveBeenCalledTimes(1);
    expect(isBrandingBootstrapDegraded()).toBe(true);
  });

  it("promesa rechazada por resolveAndApplyBranding (datos de branding inválidos): cae al default sin lanzar", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: "org-1" } } },
    });
    resolveAndApplyBrandingMock.mockRejectedValue(
      new Error("manifest inválido: falta primaryColor")
    );
    await expect(bootstrapAppBranding()).resolves.toBeUndefined();
    expect(clearTenantBrandingMock).toHaveBeenCalledTimes(1);
    expect(isBrandingBootstrapDegraded()).toBe(true);
  });

  it("no expone el error crudo: el log de consola no incluye el objeto Error completo", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    getSessionMock.mockRejectedValue(new Error("secreto-no-deberia-aparecer-completo"));
    await bootstrapAppBranding();

    const loggedArgs = consoleSpy.mock.calls[0];
    expect(loggedArgs[1]).toEqual(
      expect.objectContaining({ name: "Error", message: expect.any(String) })
    );
    consoleSpy.mockRestore();
  });

  it("path con ?org resuelve branding del club de la URL, no depende de sesión", async () => {
    getPathOrgMock.mockReturnValue("club-abc");
    await expect(bootstrapAppBranding()).resolves.toBeUndefined();
    expect(resolveAndApplyBrandingMock).toHaveBeenCalledWith("club-abc");
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it("retryBrandingBootstrap: reintento exitoso limpia el estado degradado", async () => {
    getSessionMock.mockRejectedValueOnce(new Error("network down"));
    await bootstrapAppBranding();
    expect(isBrandingBootstrapDegraded()).toBe(true);

    getSessionMock.mockResolvedValue({ data: { session: null } });
    await expect(retryBrandingBootstrap()).resolves.toBe(true);
    expect(isBrandingBootstrapDegraded()).toBe(false);
  });

  it("retryBrandingBootstrap: si vuelve a fallar, sigue degradado y no lanza", async () => {
    getSessionMock.mockRejectedValue(new Error("still down"));
    await bootstrapAppBranding();
    expect(isBrandingBootstrapDegraded()).toBe(true);

    await expect(retryBrandingBootstrap()).resolves.toBe(false);
    expect(isBrandingBootstrapDegraded()).toBe(true);
  });

  it("no hay loop automático: bootstrapAppBranding() no reintenta por su cuenta tras fallar", async () => {
    getSessionMock.mockRejectedValue(new Error("down"));
    await bootstrapAppBranding();
    // Un solo intento por invocación: getSession se llamó exactamente una vez.
    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });
});
