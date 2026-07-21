/**
 * Contrato de escala de superficies para tenants premium (v2.3).
 *
 * Un tenant premium NO puede heredar las superficies del default global: debe
 * declarar su propia escala `--ro-*`. Este test verifica, leyendo el CSS fuente
 * (no runtime — jsdom no resuelve var()/cascada de custom properties), que:
 *
 *   1. El scope del tenant está en el bloque de superficies oscuras → hereda la
 *      base oscura (`--ro-text-primary`, sombras, ring).
 *   2. Un bloque posterior restituye su escala propia (`--ro-bg-*`, `--ro-accent`,
 *      `--ro-border`) con los valores de su manifiesto, NO los claros de :root.
 *
 * El contrato JS `publicBrandingFlash` pasa 9/9 y no detectaba esto: el bug era
 * puramente de CSS.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HACK_PADEL_MANIFEST } from "./manifests/hack-padel";
import type { BrandManifest } from "./types";

const TOKENS_CSS = join(__dirname, "../styles/riviera-open-tokens.css");

const norm = (hex: string) => hex.trim().toLowerCase();

interface Block {
  selector: string;
  decls: Record<string, string>;
}

function parseBlocks(css: string): Block[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /([^{}]+)\{([^{}]*)\}/g;
  const out: Block[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null) {
    const selector = m[1].trim();
    const decls: Record<string, string> = {};
    for (const line of m[2].split(";")) {
      const i = line.indexOf(":");
      if (i === -1) continue;
      const prop = line.slice(0, i).trim();
      if (!prop.startsWith("--")) continue;
      decls[prop] = line.slice(i + 1).trim();
    }
    out.push({ selector, decls });
  }
  return out;
}

const css = readFileSync(TOKENS_CSS, "utf8");
const blocks = parseBlocks(css);

const rootBlock = blocks.find(
  (b) => /(^|,)\s*:root\s*$/.test(b.selector) && b.decls["--ro-chrome-text"],
);

// Cada tenant premium con su clave de scope en el CSS.
const PREMIUM_TENANTS: Array<{ key: string; manifest: BrandManifest }> = [
  { key: "hack-padel", manifest: HACK_PADEL_MANIFEST },
];

describe.each(PREMIUM_TENANTS)(
  "escala --ro-* del tenant premium: $key",
  ({ key, manifest }) => {
    // Bloque oscuro base: incluye el scope del tenant y define --ro-text-primary.
    const darkBase = blocks.find(
      (b) => b.selector.includes(key) && b.decls["--ro-text-primary"],
    );
    // Bloque de restitución: incluye el scope del tenant y su superficie propia
    // como valor literal (no `var(--ro-chrome-*)`, que es la base oscura madre).
    const tenantScale = blocks.find(
      (b) =>
        b.selector.includes(key) &&
        b.decls["--ro-bg-card"] &&
        !b.decls["--ro-bg-card"].startsWith("var("),
    );

    it("hereda la base oscura (--ro-text-primary declarado en su scope)", () => {
      expect(darkBase).toBeDefined();
      expect(darkBase!.decls["--ro-text-primary"]).toBeTruthy();
    });

    it("el texto primario resuelve claro (--ro-chrome-text = manifiesto.text)", () => {
      expect(rootBlock).toBeDefined();
      expect(norm(rootBlock!.decls["--ro-chrome-text"])).toBe(
        norm(manifest.colors.text),
      );
    });

    it("declara su superficie propia, NO la clara de :root", () => {
      expect(tenantScale).toBeDefined();
      expect(norm(tenantScale!.decls["--ro-bg-card"])).toBe(
        norm(manifest.colors.surfaceAlt),
      );
      expect(norm(tenantScale!.decls["--ro-bg-base"])).toBe(
        norm(manifest.colors.surface),
      );
      // La escala clara de :root tiene --ro-bg-card blanco: nunca debe filtrarse.
      expect(norm(tenantScale!.decls["--ro-bg-card"])).not.toBe("#ffffff");
    });

    it("declara su acento y borde propios (= manifiesto)", () => {
      expect(norm(tenantScale!.decls["--ro-accent"])).toBe(
        norm(manifest.colors.accent),
      );
      expect(norm(tenantScale!.decls["--ro-border"])).toBe(
        norm(manifest.colors.border),
      );
    });

    it("cubre las islas .ro-surface-dark anidadas dentro del tenant", () => {
      // Sin el combinador descendiente, login/públicas/chrome de Hack tomarían
      // la escala del chrome madre (blanco/#12161b) en vez de la del tenant.
      const hasDescendant = blocks.some(
        (b) =>
          b.selector.includes(key) &&
          b.selector.includes(".ro-surface-dark") &&
          b.decls["--ro-bg-card"],
      );
      expect(hasDescendant).toBe(true);
    });
  },
);
