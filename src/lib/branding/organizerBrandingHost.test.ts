import {
  bindingFromBrandingSettings,
  rowToPublicDtoFields,
} from "./organizerBrandingPublicDto";

/**
 * Branding: el anfitrión del evento manda; el usuario autenticado no.
 * DTO público no filtra campos privados (solo expone whitelist).
 */
describe("organizador branding host authority", () => {
  it("19. premium → binding de club", () => {
    const b = bindingFromBrandingSettings("org-host-premium", {
      premiumBrandingEnabled: true,
      brandingKey: "club-alpha",
    });
    expect(b?.brandingKey).toBe("club-alpha");
    expect(b?.organizadorId).toBe("org-host-premium");
  });

  it("20. básico → sin binding (Riviera)", () => {
    const b = bindingFromBrandingSettings("org-basic", {
      premiumBrandingEnabled: false,
      brandingKey: "should-ignore",
    });
    expect(b).toBeNull();
  });

  it("21. Hack autenticado abre evento de otro org básico → marca del anfitrión (básico)", () => {
    const hostOrg = "org-basic-host";
    const authenticatedHack = "org-hack-premium";
    const hostSettings = {
      premiumBrandingEnabled: false,
      brandingKey: null as string | null,
    };
    const hackSettings = {
      premiumBrandingEnabled: true,
      brandingKey: "hack-padel",
    };
    // Resolver debe usarse con hostOrg, nunca authenticatedHack
    const used = bindingFromBrandingSettings(hostOrg, hostSettings);
    const wrong = bindingFromBrandingSettings(authenticatedHack, hackSettings);
    expect(used).toBeNull();
    expect(wrong).not.toBeNull();
    expect(used).not.toEqual(wrong);
  });

  it("21b. usuario básico abre evento premium → marca del anfitrión premium", () => {
    const hostOrg = "org-premium-host";
    const hostSettings = {
      premiumBrandingEnabled: true,
      brandingKey: "club-premium",
    };
    const viewerBasic = bindingFromBrandingSettings("viewer-basic", {
      premiumBrandingEnabled: false,
      brandingKey: null,
    });
    const hostBrand = bindingFromBrandingSettings(hostOrg, hostSettings);
    expect(viewerBasic).toBeNull();
    expect(hostBrand?.brandingKey).toBe("club-premium");
  });

  it("24. DTO público solo campos whitelist (sin email/plan/billing)", () => {
    const dto = rowToPublicDtoFields({
      organizador_id: "o1",
      premium_branding_enabled: true,
      branding_key: "club",
      email: "secret@example.com",
      plan: "enterprise",
      stripe_customer_id: "cus_x",
      billing_email: "bill@x.com",
    });
    expect(dto).toEqual({
      organizador_id: "o1",
      premium_branding_enabled: true,
      branding_key: "club",
    });
    expect(Object.keys(dto).sort()).toEqual(
      ["branding_key", "organizador_id", "premium_branding_enabled"].sort()
    );
  });
});
