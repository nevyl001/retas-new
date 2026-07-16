import { getConvocatoriaOriginName, getHomeEyebrow } from "./experienceFormatters";
import type { BrandManifest } from "./types";

function stubManifest(
  overrides: Partial<BrandManifest> & {
    home?: Partial<BrandManifest["home"]>;
    logos?: Partial<BrandManifest["logos"]>;
  } = {}
): BrandManifest {
  return {
    key: "test",
    displayName: "Hack Padel",
    motherBrand: "Riviera Open",
    home: {
      eyebrow: "",
      welcomeTitle: "Hola",
      welcomeSubtitle: "Sub",
      emptyState: "Vacío",
      ...overrides.home,
    },
    logos: {
      dark: "/logo.png",
      ...overrides.logos,
    },
    ...overrides,
  } as BrandManifest;
}

describe("getConvocatoriaOriginName", () => {
  it("usa el nombre del organizador aunque el eyebrow de home esté vacío por logo", () => {
    const manifest = stubManifest();
    expect(getHomeEyebrow(manifest, true, "Hack Padel")).toBe("");
    expect(getConvocatoriaOriginName(manifest, true, "Hack Padel")).toBe(
      "Hack Padel"
    );
  });

  it("cae al displayName del club si no hay nombre de organizador", () => {
    const manifest = stubManifest();
    expect(getConvocatoriaOriginName(manifest, true, null)).toBe("Hack Padel");
  });

  it("usa el nombre de usuario/organizador en cuentas sin branding de club", () => {
    const manifest = stubManifest({ displayName: "Riviera Open" });
    expect(getConvocatoriaOriginName(manifest, false, "Uriel")).toBe("Uriel");
  });
});
