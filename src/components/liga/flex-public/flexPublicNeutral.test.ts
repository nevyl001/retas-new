import fs from "fs";
import path from "path";

const read = (name: string) =>
  fs.readFileSync(path.join(__dirname, name), "utf8");

const neutral = read("flex-public-neutral.css");
const live = read("flex-public-live.css");
const jornada = read("flex-public-jornada.css");

/** Canales de un color literal (#rgb, #rrggbb, rgb/rgba). */
function literalColors(source: string): Array<[number, number, number, string]> {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Array<[number, number, number, string]> = [];
  const hex = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
  let m: RegExpExecArray | null;
  while ((m = hex.exec(css)) !== null) {
    const digits = m[1] as string;
    const h =
      digits.length === 3
        ? digits
            .split("")
            .map((c: string) => c + c)
            .join("")
        : digits;
    out.push([
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
      m[0],
    ]);
  }
  const rgb = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g;
  while ((m = rgb.exec(css)) !== null) {
    out.push([Number(m[1]), Number(m[2]), Number(m[3]), m[0]]);
  }
  return out;
}

describe("Flex pública — neutralidad de fondo y superficies", () => {
  it("ningún color literal de Flex tiene tinte azul/violeta", () => {
    for (const [name, css] of [
      ["neutral", neutral],
      ["live", live],
      ["jornada", jornada],
    ] as const) {
      for (const [r, g, b, raw] of literalColors(css)) {
        const spread = Math.max(r, g, b) - Math.min(r, g, b);
        if (spread > 3) {
          throw new Error(`${name}: color con tinte ${raw}`);
        }
      }
    }
  });

  it("solo aplica sin upgrade: data-club riviera/pending, nunca una clave de club", () => {
    expect(neutral).toContain('[data-club="riviera"]');
    expect(neutral).toContain('[data-club="pending"]');
    expect(neutral).not.toMatch(/hack-padel|padelito|padel-court|acapulco|valvidub/);
    // Toda regla activa cuelga del scope oficial del club.
    const selectors = neutral
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("{")
      .slice(0, -1)
      .map((chunk) => chunk.split("}").pop()!.trim())
      .filter(Boolean);
    expect(selectors.length).toBeGreaterThan(0);
    for (const sel of selectors) {
      expect(sel).toContain(".club-experience-scope");
    }
  });

  it("conserva la fotografía original: no cambia la imagen ni apila capas", () => {
    expect(neutral).not.toMatch(/background-image/);
    expect(neutral).not.toMatch(/url\(/);
    expect(neutral).not.toMatch(/content\s*:/);
    // Filtro solo en el pseudo-elemento de la foto, nunca en el contenedor.
    const filters = neutral.match(/[^{}]*\{[^{}]*filter\s*:[^{}]*\}/g) ?? [];
    expect(filters).toHaveLength(1);
    expect(filters[0]).toContain("::before");
    expect(filters[0]).toContain("grayscale(100%)");
  });

  it("no introduce tonos prohibidos (dorado, verde, morado, neón)", () => {
    expect(neutral).not.toMatch(/gold|purple|neon|lime/i);
  });
});
