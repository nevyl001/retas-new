import {
  buildDueloCourtLayout,
  dueloCancelContextLabel,
  dueloSlotMeta,
  formatPublicCategoriaLabel,
} from "./dueloCourtLayout";
import type { OpenRegistrationPublicEntry } from "./types";

function entry(
  id: string,
  nombre: string
): OpenRegistrationPublicEntry {
  return {
    id,
    status: "confirmed",
    riviera_id: `RIV-00000${id}`,
    nombre,
    foto_url: null,
    rating: 3,
    categoria: "5ta_fuerza",
  };
}

describe("buildDueloCourtLayout", () => {
  it("reparte 4 confirmados en Pareja A / Pareja B", () => {
    const layout = buildDueloCourtLayout([
      entry("1", "A1"),
      entry("2", "A2"),
      entry("3", "B1"),
      entry("4", "B2"),
    ]);
    expect(layout.parejaA[0]?.nombre).toBe("A1");
    expect(layout.parejaA[1]?.nombre).toBe("A2");
    expect(layout.parejaB[0]?.nombre).toBe("B1");
    expect(layout.parejaB[1]?.nombre).toBe("B2");
  });

  it("deja huecos disponibles si faltan jugadores", () => {
    const layout = buildDueloCourtLayout([entry("1", "Solo")]);
    expect(layout.parejaA[0]?.nombre).toBe("Solo");
    expect(layout.parejaA[1]).toBeNull();
    expect(layout.parejaB[0]).toBeNull();
    expect(layout.parejaB[1]).toBeNull();
  });
});

describe("dueloSlotMeta", () => {
  it("indica compañero del mismo lado", () => {
    const layout = buildDueloCourtLayout([
      entry("1", "Nevyl"),
      entry("2", "Iker"),
      entry("3", "Paco"),
      entry("4", "Luis"),
    ]);
    expect(dueloSlotMeta(layout, "A", 0).partnerName).toBe("Iker");
    expect(dueloSlotMeta(layout, "A", 1).partnerName).toBe("Nevyl");
    expect(dueloSlotMeta(layout, "B", 0).sideLabel).toContain("Lado B");
  });
});

describe("dueloCancelContextLabel", () => {
  it("arma etiqueta con lado", () => {
    const layout = buildDueloCourtLayout([
      entry("1", "Nevyl"),
      entry("2", "Iker"),
    ]);
    expect(dueloCancelContextLabel("1", layout)).toBe(
      "Nevyl · Pareja 1 · Lado A"
    );
  });
});

describe("formatPublicCategoriaLabel", () => {
  it("humaniza 5ta_fuerza", () => {
    expect(formatPublicCategoriaLabel("5ta_fuerza")).toBe("5ta Fuerza");
    expect(formatPublicCategoriaLabel("5ta Fuerza")).toBe("5ta Fuerza");
  });
});
