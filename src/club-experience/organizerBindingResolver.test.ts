import {
  isPremiumBrandingEnabledForOrganizador,
  resolveBrandingKeyForOrganizador,
  setRuntimeOrganizerClubBindings,
} from "./organizerBindingResolver";
import { ORGANIZADOR_CLUB_BINDINGS } from "./organizadorClubIndex";

const HACK_ORG = ORGANIZADOR_CLUB_BINDINGS[0]?.organizadorId ?? "";
const OTHER_ORG = "00000000-0000-4000-8000-000000000001";

describe("organizerBindingResolver", () => {
  afterEach(() => {
    setRuntimeOrganizerClubBindings([]);
  });

  it("activa premium branding solo con upgrade elegible", () => {
    expect(isPremiumBrandingEnabledForOrganizador(HACK_ORG)).toBe(true);
    expect(resolveBrandingKeyForOrganizador(HACK_ORG)).toBe("hack-padel");
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
});
