#!/usr/bin/env node
/**
 * lint:tokens — falla (exit 1) si un token --ro-* se usa en un rol que no le
 * corresponde. Este es el bug que rompió la migración dos veces: un token de
 * fondo en `color:` o uno de texto en `background:` es CSS sintácticamente
 * perfecto, así que ni `tsc` ni `build` lo detectan.
 *
 * Roles por propiedad:
 *   color, fill                 → texto
 *   background, background-color → fondo
 *   border*, outline, stroke     → borde
 *   *shadow*                     → sombra
 *
 * Familias de token y su rol válido:
 *   texto|borde : --ro-text-*, --ro-chrome-text*, --ro-gold-text, --ro-medal-*,
 *                 --ro-mode-* (sin sufijo -dim), --ro-success, --ro-error, --ro-pending
 *   fondo       : --ro-bg-*, --ro-chrome-bg, --ro-chrome-deep, --ro-chrome-elevated,
 *                 --ro-chrome-active, --ro-cream, *-dim
 *   borde       : --ro-border*, --ro-gold-border, --ro-cream-border, --ro-chrome-border
 *   sombra      : --ro-shadow-*
 *
 * Errores:
 *   1. token de familia fondo en color:/fill:            → error
 *   2. token de familia texto en background:             → error
 *   3. token de familia sombra fuera de *shadow*         → error
 *   4. hex literal en color:/background: fuera de tokens → warning
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const SRC = "./src";

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n.startsWith(".")) continue;
    const p = join(dir, n);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}

function roleOfProp(prop) {
  const p = prop.toLowerCase();
  if (p === "color" || p === "fill") return "texto";
  if (p.includes("shadow")) return "sombra";
  if (p.startsWith("border") || p === "outline" || p === "stroke" || p === "column-rule" || p === "outline-color" || p === "border-color") return "borde";
  if (p === "background" || p === "background-color") return "fondo";
  return null;
}

// Clasifica un token --ro-* en su familia. Orden = prioridad.
function familyOf(tok) {
  const t = tok.toLowerCase();
  if (t.startsWith("--ro-shadow-")) return "sombra";
  if (t.startsWith("--ro-border") || t === "--ro-gold-border" || t === "--ro-cream-border" || t === "--ro-chrome-border") return "borde";
  if (t.endsWith("-dim")) return "fondo";
  if (t.startsWith("--ro-bg-") || t === "--ro-chrome-bg" || t === "--ro-chrome-deep" || t === "--ro-chrome-elevated" || t === "--ro-chrome-active" || t === "--ro-cream") return "fondo";
  // Colores semánticos/decorativos: válidos como texto, borde O relleno
  // (badges, dots, tints, gradientes de podio). No son el bug de neutrales.
  if (t.startsWith("--ro-medal-") || t.startsWith("--ro-mode-") || t === "--ro-success" || t === "--ro-error" || t === "--ro-pending") return "semantico";
  if (t.startsWith("--ro-text-") || t.startsWith("--ro-chrome-text") || t === "--ro-gold-text") return "texto";
  return null; // familia no clasificada → sin regla
}

function selectorAt(src, offset) {
  const open = src.lastIndexOf("{", offset);
  if (open === -1) return "?";
  const b = Math.max(src.lastIndexOf("}", open - 1), src.lastIndexOf("{", open - 1), src.lastIndexOf(";", open - 1));
  return src.slice(b + 1, open).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
}

const DECL = /([a-zA-Z-]+)\s*:\s*([^;{}]+)/g;
const files = walk(SRC).filter((f) => extname(f) === ".css");

const errors = [];
const warnings = [];

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")); // borra comentarios, conserva saltos de línea
  const isTokenFile = /tokens/.test(file);
  for (const m of src.matchAll(DECL)) {
    const prop = m[1];
    const value = m[2];
    if (prop.startsWith("--")) continue; // definición de custom property, no un uso
    const role = roleOfProp(prop);
    const line = src.slice(0, m.index).split("\n").length;
    const loc = () => `${file}:${line}  ${selectorAt(src, m.index)}\n      ${prop}: ${value.trim()}`;

    // Reglas 1-3: tokens --ro-* en rol equivocado
    for (const tm of value.matchAll(/var\(\s*(--ro-[a-z0-9-]+)/gi)) {
      const fam = familyOf(tm[1]);
      if (!fam || !role) continue;
      if (fam === "fondo" && role === "texto") errors.push(`[R1 fondo→texto] ${loc()}  ← ${tm[1]}`);
      else if (fam === "texto" && role === "fondo") errors.push(`[R2 texto→fondo] ${loc()}  ← ${tm[1]}`);
      else if (fam === "sombra" && role !== "sombra") errors.push(`[R3 sombra→${role}] ${loc()}  ← ${tm[1]}`);
    }

    // Regla 4: hex literal en color/background fuera de archivos de tokens → warning
    if (!isTokenFile && (role === "texto" || role === "fondo") && /#[0-9a-fA-F]{3,8}\b/.test(value)) {
      warnings.push(`[W4 hex literal] ${loc()}`);
    }
  }
}

for (const w of warnings) console.log("WARN  " + w + "\n");
for (const e of errors) console.log("ERROR " + e + "\n");
console.log(`\nlint:tokens — ${errors.length} errores, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
