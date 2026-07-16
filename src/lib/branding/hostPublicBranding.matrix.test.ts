import {
  PUBLIC_BRANDING_MATRIX,
  resolveHostOrganizadorId,
} from "./resolveHostPublicBranding";
import { rowToPublicDtoFields } from "./organizerBrandingPublicDto";
import { bindingFromBrandingSettings } from "./organizerBrandingSettings";
import {
  buildSharePublicOgUrlFromPlayUrl,
  buildShareDestOgUrlForTests,
  buildShareRetaOgUrlForTests,
  normalizePublicDestPath,
} from "../retaAbierta/shareOgUrl";
import {
  buildShareRetaOgHtml,
  RIVIERA_OG_IMAGE,
  shouldExposeShareOg,
} from "../retaAbierta/shareOgHtml";

describe("host public branding rule", () => {
  it("anfitrión premium + visitante básico → binding del anfitrión", () => {
    const host = "org-premium-host";
    const viewer = "org-viewer-basic";
    expect(
      resolveHostOrganizadorId({
        hostOrganizadorId: host,
        viewerAuthUid: viewer,
      })
    ).toBe(host);
    const hostBrand = bindingFromBrandingSettings(host, {
      premiumBrandingEnabled: true,
      brandingKey: "club-x",
    });
    const viewerBrand = bindingFromBrandingSettings(viewer, {
      premiumBrandingEnabled: false,
      brandingKey: null,
    });
    expect(hostBrand?.brandingKey).toBe("club-x");
    expect(viewerBrand).toBeNull();
  });

  it("anfitrión básico + visitante premium → Riviera (sin binding host)", () => {
    const host = "org-basic";
    const viewer = "org-premium-visitor";
    expect(
      resolveHostOrganizadorId({
        hostOrganizadorId: host,
        viewerAuthUid: viewer,
      })
    ).toBe(host);
    expect(
      bindingFromBrandingSettings(host, {
        premiumBrandingEnabled: false,
        brandingKey: "ignored",
      })
    ).toBeNull();
  });

  it("sesión anónima: host org manda", () => {
    expect(
      resolveHostOrganizadorId({
        hostOrganizadorId: "org-a",
        viewerAuthUid: null,
      })
    ).toBe("org-a");
  });

  it("DTO público no expone email/plan/billing", () => {
    const dto = rowToPublicDtoFields({
      organizador_id: "o1",
      premium_branding_enabled: true,
      branding_key: "club",
      email: "x@y.com",
      plan: "pro",
      stripe_customer_id: "cus",
    });
    expect(Object.keys(dto).sort()).toEqual(
      ["branding_key", "organizador_id", "premium_branding_enabled"].sort()
    );
  });

  it("matriz de cobertura está documentada", () => {
    expect(PUBLIC_BRANDING_MATRIX.length).toBeGreaterThanOrEqual(6);
    expect(
      PUBLIC_BRANDING_MATRIX.some((r) => r.modeRuta.includes("/jugar"))
    ).toBe(true);
  });
});

describe("WhatsApp OG URLs for all public dests", () => {
  const base = "https://proj.supabase.co/functions/v1/share-reta-og";

  it("WhatsApp premium/básico: slug convocatoria", () => {
    expect(buildShareRetaOgUrlForTests("ra-xx", base)).toBe(
      `${base}?slug=ra-xx`
    );
  });

  it("WhatsApp dest: liga / duelo / reta / TE", () => {
    expect(
      buildShareDestOgUrlForTests("/public/liga/abc", base)
    ).toContain("dest=%2Fpublic%2Fliga%2Fabc");
    expect(
      buildSharePublicOgUrlFromPlayUrl(
        "https://appriviera.rivieraopen.com/public/duelo-2v2/xyz"
      )
    ).toMatch(/dest=/);
    expect(
      buildSharePublicOgUrlFromPlayUrl("/torneo-express/tid/grupos")
    ).toMatch(/dest=/);
    expect(
      normalizePublicDestPath("https://x.com/public/abc#frag")
    ).toBe("/public/abc");
  });

  it("jugar slug preferido sobre dest", () => {
    const prev = process.env.REACT_APP_SHARE_OG_BASE_URL;
    process.env.REACT_APP_SHARE_OG_BASE_URL = base;
    expect(
      buildSharePublicOgUrlFromPlayUrl("/jugar/ra-slug1")
    ).toBe(`${base}?slug=ra-slug1`);
    process.env.REACT_APP_SHARE_OG_BASE_URL = prev;
  });

  it("HTML OG básico vs premium", () => {
    const basic = buildShareRetaOgHtml({
      slug: "s",
      title: "Reta",
      description: "d",
      playUrl: "https://appriviera.rivieraopen.com/jugar/s",
      canonicalUrl: `${base}?slug=s`,
      appOrigin: "https://appriviera.rivieraopen.com",
      brand: { premiumBrandingEnabled: false, brandingKey: null },
    });
    expect(basic).toContain(RIVIERA_OG_IMAGE);
    const premium = buildShareRetaOgHtml({
      slug: "s",
      title: "Reta",
      description: "d",
      playUrl: "https://appriviera.rivieraopen.com/jugar/s",
      canonicalUrl: `${base}?slug=s`,
      appOrigin: "https://appriviera.rivieraopen.com",
      brand: {
        premiumBrandingEnabled: true,
        brandingKey: "club-z",
        clubTitle: "Club Z",
      },
    });
    expect(premium).toMatch(/Club Z/);
    expect(premium).toMatch(/branding\/club-z\/og\.png/);
    expect(shouldExposeShareOg({ enabled: true, status: "open" })).toBe(true);
  });
});
