import {
  boostAccentForUi,
  pickDominantFromImageData,
  rgbToCssTriplet,
  rgbToHsl,
} from "./extractTeamLogoAccent";

function fillSolid(
  r: number,
  g: number,
  b: number,
  pixels = 16
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < pixels; i += 1) {
    const o = i * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
  }
  return data;
}

describe("extractTeamLogoAccent", () => {
  it("rgbToCssTriplet formatea triplet CSS", () => {
    expect(rgbToCssTriplet({ r: 10, g: 20, b: 30 })).toBe("10, 20, 30");
  });

  it("pickDominantFromImageData ignora grises/negros y elige el cromático", () => {
    const data = new Uint8ClampedArray(32 * 4);
    // mitad negro/gris
    for (let i = 0; i < 16; i += 1) {
      const o = i * 4;
      data[o] = i % 2 === 0 ? 0 : 120;
      data[o + 1] = i % 2 === 0 ? 0 : 120;
      data[o + 2] = i % 2 === 0 ? 0 : 120;
      data[o + 3] = 255;
    }
    // mitad azul saturado
    for (let i = 16; i < 32; i += 1) {
      const o = i * 4;
      data[o] = 30;
      data[o + 1] = 80;
      data[o + 2] = 220;
      data[o + 3] = 255;
    }
    const accent = pickDominantFromImageData(data);
    expect(accent).not.toBeNull();
    const hsl = rgbToHsl(accent!);
    // azul ~200–260°
    expect(hsl.h).toBeGreaterThan(180);
    expect(hsl.h).toBeLessThan(270);
    expect(hsl.s).toBeGreaterThan(0.4);
  });

  it("pickDominantFromImageData detecta verde de un logo tipo Oasis", () => {
    const data = fillSolid(40, 140, 70, 24);
    const accent = pickDominantFromImageData(data);
    expect(accent).not.toBeNull();
    const hsl = rgbToHsl(accent!);
    expect(hsl.h).toBeGreaterThan(90);
    expect(hsl.h).toBeLessThan(160);
  });

  it("boostAccentForUi sube saturación de un color apagado", () => {
    const muted = { r: 90, g: 100, b: 130 };
    const boosted = boostAccentForUi(muted);
    expect(rgbToHsl(boosted).s).toBeGreaterThan(rgbToHsl(muted).s);
  });

  it("sin píxeles útiles retorna null", () => {
    expect(pickDominantFromImageData(fillSolid(0, 0, 0))).toBeNull();
    expect(pickDominantFromImageData(fillSolid(250, 250, 250))).toBeNull();
  });
});
