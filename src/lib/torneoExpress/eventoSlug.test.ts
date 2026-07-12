import { slugifyEvento } from "./eventoSlug";

describe("slugifyEvento", () => {
  it("minúsculas, sin acentos y guiones", () => {
    expect(slugifyEvento("Riviera Open Rush Series #4")).toBe(
      "riviera-open-rush-series-4"
    );
    expect(slugifyEvento("  Torneo Mixta  ")).toBe("torneo-mixta");
  });

  it("quita acentos y caracteres raros", () => {
    expect(slugifyEvento("Categoría 5ª / Open!")).toBe("categoria-5-open");
    expect(slugifyEvento("Ñandú & Co.")).toBe("nandu-co");
  });

  it("fallback si queda vacío", () => {
    expect(slugifyEvento("!!!")).toBe("evento");
    expect(slugifyEvento("   ")).toBe("evento");
  });
});
