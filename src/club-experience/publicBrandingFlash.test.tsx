/**
 * Tests del contrato anti-flash de branding en vistas públicas.
 * No usa timeouts reales; mockea sync de binding con promesas controladas.
 *
 * Usa react-dom/test-utils `act` (no @testing-library). Desactivar la regla
 * testing-library/no-unnecessary-act — igual que LigaGestionar.render.test.tsx.
 */
/* eslint-disable testing-library/no-unnecessary-act */
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import {
  getClubExperienceCacheIfMatches,
  readClubExperienceCache,
} from "../branding/organizerResolver";
import { CLUB_EXPERIENCE_CACHE_KEY } from "../branding/constants";
import { getPublicOrganizadorIdFromPath } from "../lib/rivieraJugadores/publicOrganizador";
import { RIVIERA_PRODUCT_NAME } from "./motherBrand";
import { ORGANIZADOR_CLUB_BINDINGS } from "./organizadorClubIndex";
import { PublicEventBrandIdentity } from "./components/PublicEventBrandIdentity";
import { PublicEventNeutralLoading } from "./components/PublicEventNeutralLoading";
import { ClubExperienceScope, useClubExperience } from "./ClubExperienceContext";

const HACK_ORG = ORGANIZADOR_CLUB_BINDINGS[0]?.organizadorId ?? "";
const OTHER_ORG = "11111111-1111-4111-8111-111111111111";

let mockSyncDeferred: {
  resolve: () => void;
  promise: Promise<void>;
} | null = null;

const mockSyncRuntimeBindingForOrganizador = jest.fn(
  (_organizadorId?: string | null) =>
    mockSyncDeferred ? mockSyncDeferred.promise : Promise.resolve()
);

jest.mock("../lib/branding/organizerBrandingSettings", () => ({
  syncRuntimeBindingForOrganizador: (organizadorId?: string | null) =>
    mockSyncRuntimeBindingForOrganizador(organizadorId),
}));

jest.mock("./useOrganizerDisplayName", () => ({
  useOrganizerDisplayName: () => "Club Test",
}));

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { resolve, promise };
}

function BrandProbe() {
  const {
    brandingStatus,
    isScopeBrandingReady,
    isClubBranded,
    manifest,
  } = useClubExperience();
  return (
    <div
      data-testid="probe"
      data-status={brandingStatus}
      data-ready={String(isScopeBrandingReady)}
      data-club={String(isClubBranded)}
      data-key={manifest.brandingKey}
    />
  );
}

describe("public branding flash contract", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (global as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockSyncDeferred = null;
    mockSyncRuntimeBindingForOrganizador.mockImplementation(() =>
      mockSyncDeferred ? mockSyncDeferred.promise : Promise.resolve()
    );
    window.localStorage.clear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    window.localStorage.clear();
  });

  it("ruta pública sin org en path: getPublicOrganizadorIdFromPath no inventa org", () => {
    expect(getPublicOrganizadorIdFromPath("/reta/abc-123")).toBeNull();
    expect(getPublicOrganizadorIdFromPath("/reta-abierta/ra-abc")).toBeNull();
    expect(getPublicOrganizadorIdFromPath("/jugar/ra-abc")).toBeNull();
    expect(getPublicOrganizadorIdFromPath("/americano/xyz")).toBeNull();
    expect(getPublicOrganizadorIdFromPath("/duelo-2v2/abc")).toBeNull();
    expect(getPublicOrganizadorIdFromPath("/liga/abc")).toBeNull();
    expect(getPublicOrganizadorIdFromPath("/torneo-express/abc/grupos")).toBeNull();
    expect(getPublicOrganizadorIdFromPath(`/ranking/o/${HACK_ORG}`)).toBe(
      HACK_ORG
    );
  });

  it("caché premium nunca se usa a ciegas sin organizador esperado", () => {
    window.localStorage.setItem(
      CLUB_EXPERIENCE_CACHE_KEY,
      JSON.stringify({
        organizadorId: HACK_ORG.toLowerCase(),
        brandingKey: "hack-padel",
      })
    );
    expect(readClubExperienceCache()?.brandingKey).toBe("hack-padel");
    expect(getClubExperienceCacheIfMatches(null)).toBeNull();
    expect(getClubExperienceCacheIfMatches(undefined)).toBeNull();
    expect(getClubExperienceCacheIfMatches("")).toBeNull();
  });

  it("caché de Hack no se aplica a otro club", () => {
    window.localStorage.setItem(
      CLUB_EXPERIENCE_CACHE_KEY,
      JSON.stringify({
        organizadorId: HACK_ORG.toLowerCase(),
        brandingKey: "hack-padel",
      })
    );
    expect(getClubExperienceCacheIfMatches(OTHER_ORG)).toBeNull();
    expect(getClubExperienceCacheIfMatches(HACK_ORG)?.brandingKey).toBe(
      "hack-padel"
    );
  });

  it("scope público con org null + pendingUntilOrganizador: pending sin Riviera identity", () => {
    act(() => {
      root.render(
        <ClubExperienceScope organizadorId={null} pendingUntilOrganizador>
          <BrandProbe />
          <PublicEventBrandIdentity />
        </ClubExperienceScope>
      );
    });

    const scope = container.querySelector(".club-experience-scope") as HTMLElement | null;
    expect(scope?.getAttribute("data-branding-status")).toBe("pending");
    expect(scope?.getAttribute("data-brand")).toBe("pending");
    expect(container.querySelector("[data-testid='probe']")?.getAttribute("data-status")).toBe(
      "pending"
    );
    expect(container.querySelector(".club-identity")).toBeNull();
    // Pending = mismos acentos que Riviera Open (sin flash gris/oro).
    expect(scope?.style.getPropertyValue("--ro-accent").trim()).toBe("#ffffff");
    expect(scope?.style.getPropertyValue("--brand-accent").trim()).toBe("#ffffff");
  });

  it("loader neutro no incluye Riviera Open ni logo", () => {
    act(() => {
      root.render(
        <PublicEventNeutralLoading message="Cargando resultados de la reta…" />
      );
    });
    expect(container.textContent).toContain("Cargando resultados de la reta…");
    expect(container.textContent).not.toContain(RIVIERA_PRODUCT_NAME);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".club-identity")).toBeNull();
  });

  it("tras resolver org premium: identity lista y club branded", async () => {
    if (!HACK_ORG) return;

    mockSyncDeferred = createDeferred();

    act(() => {
      root.render(
        <ClubExperienceScope organizadorId={HACK_ORG} pendingUntilOrganizador>
          <BrandProbe />
          <PublicEventBrandIdentity />
        </ClubExperienceScope>
      );
    });

    expect(
      container.querySelector("[data-testid='probe']")?.getAttribute("data-status")
    ).toBe("pending");
    expect(container.querySelector(".club-identity")).toBeNull();

    await act(async () => {
      mockSyncDeferred!.resolve();
      await mockSyncDeferred!.promise;
    });

    const probe = container.querySelector("[data-testid='probe']");
    expect(probe?.getAttribute("data-status")).toBe("resolved");
    expect(probe?.getAttribute("data-ready")).toBe("true");
    expect(probe?.getAttribute("data-club")).toBe("true");
    expect(probe?.getAttribute("data-key")).toBe("hack-padel");
    expect(container.querySelector(".club-identity")).not.toBeNull();
    expect(container.textContent).not.toContain(RIVIERA_PRODUCT_NAME);
  });

  it("tras resolver org sin upgrade: branding final Riviera", async () => {
    mockSyncDeferred = createDeferred();

    act(() => {
      root.render(
        <ClubExperienceScope organizadorId={OTHER_ORG} pendingUntilOrganizador>
          <BrandProbe />
          <PublicEventBrandIdentity />
        </ClubExperienceScope>
      );
    });

    expect(container.querySelector(".club-identity")).toBeNull();

    await act(async () => {
      mockSyncDeferred!.resolve();
      await mockSyncDeferred!.promise;
    });

    const probe = container.querySelector("[data-testid='probe']");
    expect(probe?.getAttribute("data-status")).toBe("resolved");
    expect(probe?.getAttribute("data-club")).toBe("false");
    expect(probe?.getAttribute("data-key")).toBe("riviera");
    expect(container.querySelector(".club-identity")).not.toBeNull();
    expect(container.textContent).toContain(RIVIERA_PRODUCT_NAME);
  });

  it("scope madre (sin pendingUntilOrganizador) con null resuelve Riviera", async () => {
    mockSyncDeferred = createDeferred();

    act(() => {
      root.render(
        <ClubExperienceScope organizadorId={null}>
          <BrandProbe />
          <PublicEventBrandIdentity />
        </ClubExperienceScope>
      );
    });

    await act(async () => {
      mockSyncDeferred!.resolve();
      await mockSyncDeferred!.promise;
    });

    expect(
      container.querySelector("[data-testid='probe']")?.getAttribute("data-status")
    ).toBe("resolved");
    expect(container.textContent).toContain(RIVIERA_PRODUCT_NAME);
  });

  it("caché de otro club + evento Hack: no muestra el otro club antes de resolver", async () => {
    if (!HACK_ORG) return;

    window.localStorage.setItem(
      CLUB_EXPERIENCE_CACHE_KEY,
      JSON.stringify({
        organizadorId: OTHER_ORG,
        brandingKey: "some-other-club",
      })
    );
    expect(getClubExperienceCacheIfMatches(HACK_ORG)).toBeNull();

    mockSyncDeferred = createDeferred();
    act(() => {
      root.render(
        <ClubExperienceScope organizadorId={HACK_ORG} pendingUntilOrganizador>
          <BrandProbe />
          <PublicEventBrandIdentity />
        </ClubExperienceScope>
      );
    });

    expect(container.querySelector(".club-identity")).toBeNull();
    expect(
      container.querySelector("[data-testid='probe']")?.getAttribute("data-status")
    ).toBe("pending");

    await act(async () => {
      mockSyncDeferred!.resolve();
      await mockSyncDeferred!.promise;
    });

    expect(
      container.querySelector("[data-testid='probe']")?.getAttribute("data-key")
    ).toBe("hack-padel");
  });
});
