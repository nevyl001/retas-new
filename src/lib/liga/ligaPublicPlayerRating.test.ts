import {
  formatLigaPublicRatingValue,
  resolveLigaPublicPlayerRating,
} from "./ligaPublicPlayerRating";

describe("resolveLigaPublicPlayerRating", () => {
  it("prioriza nivel de liga como rating original", () => {
    const r = resolveLigaPublicPlayerRating(4.5, 3.1);
    expect(r).toEqual({
      value: 4.5,
      source: "original",
      label: "RATING ORIGINAL",
    });
  });

  it("usa rating Riviera solo si no hay nivel, sin llamarlo original", () => {
    const r = resolveLigaPublicPlayerRating(null, 3.31);
    expect(r.source).toBe("current");
    expect(r.label).toBe("RATING");
    expect(r.value).toBe(3.31);
  });

  it("sin datos verificables no inventa 3.00", () => {
    const r = resolveLigaPublicPlayerRating(null, null);
    expect(r.source).toBe("none");
    expect(r.value).toBeNull();
    expect(r.label).toBe("Sin rating registrado");
  });

  it("formatea a 2 decimales", () => {
    expect(formatLigaPublicRatingValue(4.5)).toBe("4.50");
  });
});
