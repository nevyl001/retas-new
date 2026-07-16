import {
  buildShareRetaOgHtml,
  resolveShareOgImage,
  shouldExposeShareOg,
  RIVIERA_OG_IMAGE,
  RIVIERA_OG_TITLE,
} from "./shareOgHtml";
import {
  buildShareRetaOgUrl,
  buildShareRetaOgUrlForTests,
} from "./shareOgUrl";

describe("share-reta-og HTML + URL", () => {
  const basePayload = {
    slug: "ra-demo",
    title: "Reta domingo",
    description: "Club test · 18:00",
    playUrl: "https://appriviera.rivieraopen.com/jugar/ra-demo",
    canonicalUrl:
      "https://xxxx.supabase.co/functions/v1/share-reta-og?slug=ra-demo",
    appOrigin: "https://appriviera.rivieraopen.com",
  };

  it("25. HTML premium contiene metadatos del club", () => {
    const html = buildShareRetaOgHtml({
      ...basePayload,
      brand: {
        premiumBrandingEnabled: true,
        brandingKey: "club-demo",
        clubTitle: "Club Demo",
      },
    });
    expect(html).toMatch(/og:title/);
    expect(html).toMatch(/Club Demo/);
    expect(html).toMatch(/og:image/);
    expect(html).toMatch(/branding\/club-demo\/og\.png/);
    expect(html).toMatch(/twitter:card/);
    expect(html).toMatch(/http-equiv="refresh" content="8;/);
    expect(html).toMatch(/Abrir convocatoria/);
  });

  it("26. HTML básico contiene metadatos Riviera", () => {
    const html = buildShareRetaOgHtml({
      ...basePayload,
      title: RIVIERA_OG_TITLE,
      brand: { premiumBrandingEnabled: false, brandingKey: null },
    });
    expect(html).toContain(RIVIERA_OG_IMAGE);
    expect(html).toMatch(/RivieraApp/);
    expect(html).not.toMatch(/branding\//);
  });

  it("27-28. evento no público / inexistente → no exponer", () => {
    expect(shouldExposeShareOg({ enabled: false, status: "open" })).toBe(
      false
    );
    expect(shouldExposeShareOg({ enabled: true, status: "draft" })).toBe(
      false
    );
    expect(shouldExposeShareOg({ enabled: true, status: "open" })).toBe(true);
  });

  it("29. og:image es URL absoluta", () => {
    const img = resolveShareOgImage({
      brand: { premiumBrandingEnabled: false, brandingKey: null },
      appOrigin: "https://appriviera.rivieraopen.com",
    });
    expect(img.startsWith("https://")).toBe(true);
    const html = buildShareRetaOgHtml({
      ...basePayload,
      brand: { premiumBrandingEnabled: false, brandingKey: null },
    });
    const m = html.match(/property="og:image" content="([^"]+)"/);
    expect(m?.[1]).toMatch(/^https:\/\//);
  });

  it("premium sin imagen club → path absoluto (fallback Riviera si falta key)", () => {
    expect(
      resolveShareOgImage({
        brand: { premiumBrandingEnabled: true, brandingKey: null },
        appOrigin: "https://appriviera.rivieraopen.com",
      })
    ).toBe(RIVIERA_OG_IMAGE);
  });

  it("30. enlace copiado usa share-reta-og base", () => {
    const url = buildShareRetaOgUrlForTests(
      "ra-xxxx",
      "https://proj.supabase.co/functions/v1/share-reta-og"
    );
    expect(url).toBe(
      "https://proj.supabase.co/functions/v1/share-reta-og?slug=ra-xxxx"
    );
    const prev = process.env.REACT_APP_SHARE_OG_BASE_URL;
    process.env.REACT_APP_SHARE_OG_BASE_URL =
      "https://proj.supabase.co/functions/v1/share-reta-og";
    expect(buildShareRetaOgUrl("ra-yyyy")).toContain("share-reta-og?slug=ra-yyyy");
    process.env.REACT_APP_SHARE_OG_BASE_URL = prev;
  });
});
