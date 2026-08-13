/**
 * Contrato de `forceRivieraLogo` (vistas públicas, 2026-08-08, sin white label):
 * - Cuenta con nombre propio distinto de "Riviera Open": logo Riviera Open +
 *   nombre de la cuenta + atribución "by Riviera Open".
 * - Cuenta que ES Riviera Open (sin nombre de organizador distinto): solo el
 *   logo, sin ningún texto.
 * Nunca se usa el logo propio del club, tenga o no upgrade de branding.
 *
 * Usa react-dom/test-utils `act` (no @testing-library), igual que
 * publicBrandingFlash.test.tsx — desactivar la regla
 * testing-library/no-unnecessary-act.
 */
/* eslint-disable testing-library/no-unnecessary-act */
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { RIVIERA_CO_BRAND_ATTRIBUTION, RIVIERA_PRODUCT_NAME } from "../motherBrand";

let mockOrganizerName: string | null = "Club Test";

jest.mock("../useOrganizerDisplayName", () => ({
  useOrganizerDisplayName: () => mockOrganizerName,
}));

jest.mock("../ClubExperienceContext", () => ({
  // Manifest de un club premium (con logo propio) — el contrato exige que
  // forceRivieraLogo lo ignore de todas formas.
  useClubExperience: () => ({
    manifest: require("../manifests/hack-padel").HACK_PADEL_MANIFEST,
    isClubBranded: true,
    organizadorId: "org-1",
  }),
}));

// Import after mocks so ClubIdentity picks up the mocked hooks.
// eslint-disable-next-line import/first
import { ClubIdentity } from "./ClubIdentity";

describe("ClubIdentity forceRivieraLogo (vista pública genérica)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (global as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("cuenta de club (con upgrade activo): logo Riviera Open + nombre de cuenta + by Riviera Open", () => {
    mockOrganizerName = "Club Test";
    act(() => {
      root.render(
        <ClubIdentity
          variant="compact"
          showTagline={false}
          showMotherAttribution
          forceRivieraLogo
        />
      );
    });

    const logoSrc = container.querySelector<HTMLImageElement>(
      ".club-identity__logo"
    )?.src;
    expect(logoSrc).toContain("/logo-riviera.png");
    expect(logoSrc).not.toContain("hack-padel");
    expect(
      container.querySelector(".club-identity__organizer")?.textContent
    ).toBe("Club Test");
    expect(
      container.querySelector(".club-identity__attribution")?.textContent
    ).toContain(RIVIERA_CO_BRAND_ATTRIBUTION);
  });

  it('cuenta que ES Riviera Open (organizerName === "Riviera Open"): solo logo, sin texto', () => {
    mockOrganizerName = RIVIERA_PRODUCT_NAME;
    act(() => {
      root.render(<ClubIdentity variant="compact" showTagline={false} forceRivieraLogo />);
    });

    const logoSrc = container.querySelector<HTMLImageElement>(
      ".club-identity__logo"
    )?.src;
    expect(logoSrc).toContain("/logo-riviera.png");
    expect(container.querySelector(".club-identity__text")).toBeNull();
    expect(container.querySelector(".club-identity__organizer")).toBeNull();
    expect(container.querySelector(".club-identity__attribution")).toBeNull();
  });

  it("sin nombre de organizador (vacío/null): solo logo, sin texto", () => {
    mockOrganizerName = null;
    act(() => {
      root.render(<ClubIdentity variant="compact" showTagline={false} forceRivieraLogo />);
    });

    expect(container.querySelector(".club-identity__text")).toBeNull();
  });

  it("hideOrganizerName: solo logo Riviera Open, sin nombre de cuenta ni atribución", () => {
    mockOrganizerName = "Club Test";
    act(() => {
      root.render(
        <ClubIdentity
          variant="compact"
          showTagline={false}
          showMotherAttribution
          forceRivieraLogo
          hideOrganizerName
        />
      );
    });

    const logoSrc = container.querySelector<HTMLImageElement>(
      ".club-identity__logo"
    )?.src;
    expect(logoSrc).toContain("/logo-riviera.png");
    expect(container.querySelector(".club-identity__text")).toBeNull();
    expect(container.querySelector(".club-identity__organizer")).toBeNull();
    expect(container.querySelector(".club-identity__attribution")).toBeNull();
    expect(
      container.querySelector(".club-identity--logo-only")
    ).not.toBeNull();
  });
});
