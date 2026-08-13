import {
  isPremiumBrandingEnabledForOrganizador,
  resolveBrandingKeyForOrganizador,
  setRuntimeOrganizerClubBindings,
} from "./organizerBindingResolver";
import {
  ORGANIZADOR_CLUB_BINDINGS,
  PADEL_COURT_SERIES_ORGANIZADOR_ID,
  VALVIDUB_SPORTS_ORGANIZADOR_ID,
} from "./organizadorClubIndex";
import { listPremiumManifestOptions } from "./manifestRegistry";

const HACK_ORG =
  ORGANIZADOR_CLUB_BINDINGS.find((b) => b.brandingKey === "hack-padel")
    ?.organizadorId ?? "";
const PCS_ORG = PADEL_COURT_SERIES_ORGANIZADOR_ID;
const VALVIDUB_ORG = VALVIDUB_SPORTS_ORGANIZADOR_ID;
const OTHER_ORG = "00000000-0000-4000-8000-000000000001";

describe("organizerBindingResolver", () => {
  afterEach(() => {
    setRuntimeOrganizerClubBindings([]);
  });

  it("activa premium branding solo con upgrade elegible", () => {
    expect(isPremiumBrandingEnabledForOrganizador(HACK_ORG)).toBe(true);
    expect(resolveBrandingKeyForOrganizador(HACK_ORG)).toBe("hack-padel");
  });

  it("resuelve Padel Court Series solo por UUID de organizador", () => {
    expect(PCS_ORG).toBe("35e31ab8-2a2f-4526-9e84-e130c85f8ca9");
    expect(isPremiumBrandingEnabledForOrganizador(PCS_ORG)).toBe(true);
    expect(resolveBrandingKeyForOrganizador(PCS_ORG)).toBe(
      "padel-court-series"
    );
    expect(
      resolveBrandingKeyForOrganizador(PCS_ORG.toUpperCase())
    ).toBe("padel-court-series");
  });

  it("no resuelve PCS por email ni por nombre (solo UUID)", () => {
    expect(
      resolveBrandingKeyForOrganizador("padelcourtseries@gmail.com")
    ).toBe("riviera");
    expect(resolveBrandingKeyForOrganizador("Padel Court Series")).toBe(
      "riviera"
    );
  });

  it("hace fallback a riviera sin binding", () => {
    expect(isPremiumBrandingEnabledForOrganizador(OTHER_ORG)).toBe(false);
    expect(resolveBrandingKeyForOrganizador(OTHER_ORG)).toBe("riviera");
  });

  it("hace fallback si premiumBrandingEnabled es false", () => {
    setRuntimeOrganizerClubBindings([
      {
        organizadorId: HACK_ORG,
        brandingKey: "hack-padel",
        active: true,
        premiumBrandingEnabled: false,
      },
    ]);

    expect(isPremiumBrandingEnabledForOrganizador(HACK_ORG)).toBe(false);
    expect(resolveBrandingKeyForOrganizador(HACK_ORG)).toBe("riviera");
  });

  it("hace fallback si active es false", () => {
    setRuntimeOrganizerClubBindings([
      {
        organizadorId: HACK_ORG,
        brandingKey: "hack-padel",
        active: false,
        premiumBrandingEnabled: true,
      },
    ]);

    expect(isPremiumBrandingEnabledForOrganizador(HACK_ORG)).toBe(false);
    expect(resolveBrandingKeyForOrganizador(HACK_ORG)).toBe("riviera");
  });

  it("resuelve Valvidub Sports por UUID de organizador", () => {
    expect(VALVIDUB_ORG).toBe("cbc93677-0450-4622-a2fa-2f40947e385b");
    expect(isPremiumBrandingEnabledForOrganizador(VALVIDUB_ORG)).toBe(true);
    expect(resolveBrandingKeyForOrganizador(VALVIDUB_ORG)).toBe(
      "valvidub-sports"
    );
  });

  it("lista tenants premium en el registry", () => {
    const options = listPremiumManifestOptions();
    expect(options.some((o) => o.key === "hack-padel")).toBe(true);
    expect(options.some((o) => o.key === "padel-court-series")).toBe(true);
    expect(options.some((o) => o.key === "valvidub-sports")).toBe(true);
    expect(options.some((o) => o.key === "riviera")).toBe(false);
  });
});
