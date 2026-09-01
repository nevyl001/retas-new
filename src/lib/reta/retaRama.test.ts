import {
  parseRetaRama,
  retaRamaPublicLabel,
} from "./retaRama";

describe("retaRama", () => {
  it("parsea valores conocidos", () => {
    expect(parseRetaRama("varonil")).toBe("varonil");
    expect(parseRetaRama("Femenil")).toBe("femenil");
    expect(parseRetaRama(" mixta ")).toBe("mixta");
    expect(parseRetaRama("")).toBe("");
    expect(parseRetaRama(null)).toBe("");
  });

  it("etiqueta pública para WhatsApp", () => {
    expect(retaRamaPublicLabel("mixta")).toBe("Mixta");
    expect(retaRamaPublicLabel("")).toBeNull();
  });
});
