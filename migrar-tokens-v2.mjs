#!/usr/bin/env node
/**
 * migrar-tokens-v2.mjs — reemplaza a migrar-tokens.mjs (v1).
 *
 * v1 mapeaba un token por hex, ignorando la propiedad CSS. Eso convirtió
 * 87 usos de `color: #ffffff` en `color: var(--ro-bg-card)` (blanco sobre
 * hueso = texto invisible) y 3 fondos negros en fondos de chrome oscuro.
 * v2 decide el token leyendo la propiedad.
 *
 *   node migrar-tokens-v2.mjs --repair          → repara el daño de v1 (simulacro)
 *   node migrar-tokens-v2.mjs --repair --write
 *   node migrar-tokens-v2.mjs                   → migra hex restantes (simulacro)
 *   node migrar-tokens-v2.mjs --write
 *
 * Corre SIEMPRE --repair primero, y sólo después la migración normal.
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const REPAIR = args.includes("--repair");
const SRC = args.includes("--src") ? args[args.indexOf("--src") + 1] : "./src";

/* ── Rol de una propiedad CSS ── */
function roleOf(prop) {
  const p = prop.toLowerCase();
  if (p === "color" || p === "fill") return "texto";
  if (p.includes("shadow")) return "sombra";
  if (p.includes("border") || p === "outline" || p === "stroke") return "borde";
  if (p.includes("background")) return "fondo";
  return "otro";
}

/* ── hex → token, por rol. null = decidir a mano. ── */
const MAP = {
  "#ffffff": { texto: "--ro-text-primary", fondo: "--ro-bg-card", borde: "--ro-border" },
  "#fafafa": { texto: "--ro-text-primary", fondo: "--ro-bg-surface", borde: "--ro-border-subtle" },
  "#f5f5f5": { texto: "--ro-text-primary", fondo: "--ro-bg-base", borde: "--ro-border-subtle" },
  "#000000": { texto: "--ro-text-primary", fondo: "--ro-bg-base", borde: "--ro-border-strong" },
  "#0a0a0a": { texto: "--ro-text-primary", fondo: "--ro-bg-deep", borde: "--ro-border-strong" },
  "#0f0f0f": { texto: "--ro-text-primary", fondo: "--ro-bg-surface", borde: "--ro-border-strong" },
  "#111111": { texto: "--ro-text-primary", fondo: "--ro-bg-card", borde: "--ro-border-strong" },
  "#121212": { texto: "--ro-text-primary", fondo: "--ro-bg-card", borde: "--ro-border-strong" },
  "#18181b": { texto: "--ro-text-primary", fondo: "--ro-bg-card", borde: "--ro-border-strong" },
  "#101820": { texto: "--ro-text-primary", fondo: "--ro-bg-card", borde: "--ro-border-strong" },
  "#1a1a1a": { texto: "--ro-text-primary", fondo: "--ro-bg-inset", borde: "--ro-border" },
  "#1f1f23": { texto: "--ro-text-primary", fondo: "--ro-bg-inset", borde: "--ro-border" },
  "#181818": { texto: "--ro-text-primary", fondo: "--ro-bg-inset", borde: "--ro-border" },
  "#2a2a2a": { texto: "--ro-text-secondary", fondo: "--ro-bg-inset", borde: "--ro-border" },
  "#2f2f2f": { texto: "--ro-text-secondary", fondo: "--ro-bg-inset", borde: "--ro-border-strong" },
  "#27272a": { texto: "--ro-text-secondary", fondo: "--ro-bg-inset", borde: "--ro-border-strong" },
  "#333333": { texto: "--ro-text-secondary", fondo: "--ro-bg-inset", borde: "--ro-border-strong" },
  "#3f3f46": { texto: "--ro-text-secondary", fondo: "--ro-bg-inset", borde: "--ro-border-strong" },
  "#4c4c4c": { texto: "--ro-text-secondary", fondo: "--ro-bg-inset", borde: "--ro-border-strong" },

  "#a0a0a0": { texto: "--ro-text-secondary", fondo: "--ro-bg-inset", borde: "--ro-border" },
  "#b8b8b8": { texto: "--ro-text-secondary", fondo: "--ro-bg-inset", borde: "--ro-border" },
  "#888888": { texto: "--ro-text-secondary", fondo: "--ro-bg-inset", borde: "--ro-border" },
  "#aaaaaa": { texto: "--ro-text-secondary", fondo: "--ro-bg-inset", borde: "--ro-border" },
  "#7a7a7a": { texto: "--ro-text-muted", fondo: "--ro-bg-inset", borde: "--ro-border" },
  "#71717a": { texto: "--ro-text-muted", fondo: "--ro-bg-inset", borde: "--ro-border" },
  "#a1a1aa": { texto: "--ro-text-muted", fondo: "--ro-bg-inset", borde: "--ro-border" },
  "#9ca3af": { texto: "--ro-text-muted", fondo: "--ro-bg-inset", borde: "--ro-border" },
  "#94a3b8": { texto: "--ro-text-muted", fondo: "--ro-bg-inset", borde: "--ro-border" },
  "#e4e4e7": { texto: "--ro-text-muted", fondo: "--ro-bg-inset", borde: "--ro-border" },

  /* Dorado: como texto SIEMPRE la variante oscura, o no cumple contraste. */
  "#c9a227": { texto: "--ro-gold-text", fondo: "--ro-gold-dim", borde: "--ro-gold-border" },
  "#e8c547": { texto: "--ro-gold-text", fondo: "--ro-gold-dim", borde: "--ro-gold-border" },
  "#fbbf24": { texto: "--ro-gold-text", fondo: "--ro-gold-dim", borde: "--ro-gold-border" },
  "#d4a843": { texto: "--ro-gold-text", fondo: "--ro-gold-dim", borde: "--ro-gold-border" },
  "#e5c878": { texto: "--ro-gold-text", fondo: "--ro-gold-dim", borde: "--ro-gold-border" },
  "#c4ad72": { texto: "--ro-gold-text", fondo: "--ro-gold-dim", borde: "--ro-gold-border" },
  "#d4af37": { texto: "--ro-medal-gold", fondo: "--ro-gold-dim", borde: "--ro-gold-border" },

  "#4ade80": { texto: "--ro-success", fondo: "--ro-success-dim", borde: "--ro-success" },
  "#86efac": { texto: "--ro-success", fondo: "--ro-success-dim", borde: "--ro-success" },
  "#34d399": { texto: "--ro-success", fondo: "--ro-success-dim", borde: "--ro-success" },
  "#3d7a5c": { texto: "--ro-success", fondo: "--ro-success-dim", borde: "--ro-success" },
  "#10b981": { texto: "--ro-mode-americano", fondo: "--ro-mode-americano-dim", borde: "--ro-mode-americano" },

  "#f87171": { texto: "--ro-error", fondo: "--ro-error-dim", borde: "--ro-error" },
  "#fca5a5": { texto: "--ro-error", fondo: "--ro-error-dim", borde: "--ro-error" },
  "#fecaca": { texto: "--ro-error", fondo: "--ro-error-dim", borde: "--ro-error" },
  "#ef4444": { texto: "--ro-error", fondo: "--ro-error-dim", borde: "--ro-error" },
  "#ff4444": { texto: "--ro-error", fondo: "--ro-error-dim", borde: "--ro-error" },

  "#fb923c": { texto: "--ro-mode-duelo", fondo: "--ro-mode-duelo-dim", borde: "--ro-mode-duelo" },
  "#3b82f6": { texto: "--ro-mode-liga", fondo: "--ro-mode-liga-dim", borde: "--ro-mode-liga" },
  "#93c5fd": { texto: "--ro-mode-liga", fondo: "--ro-mode-liga-dim", borde: "--ro-mode-liga" },
  "#8b5cf6": { texto: "--ro-mode-torneo", fondo: "--ro-mode-torneo-dim", borde: "--ro-mode-torneo" },
  "#c4b5fd": { texto: "--ro-mode-torneo", fondo: "--ro-mode-torneo-dim", borde: "--ro-mode-torneo" },
  "#555555": { texto: "--ro-pending", fondo: "--ro-bg-inset", borde: "--ro-border" },
};

/* ── Tokens que v1 pudo escribir en un rol equivocado. ── */
const V1_BAD = {
  texto: {
    "--ro-bg-card": "--ro-text-primary",
    "--ro-bg-surface": "--ro-text-primary",
    "--ro-bg-base": "--ro-text-primary",
    "--ro-bg-deep": "--ro-text-primary",
    "--ro-bg-inset": "--ro-text-primary",
    "--ro-bg-elevated": "--ro-text-primary",
    "--ro-chrome-bg": "--ro-text-primary",
    "--ro-chrome-deep": "--ro-text-primary",
    "--ro-border": "--ro-text-muted",
    "--ro-border-strong": "--ro-text-secondary",
    "--ro-gold": "--ro-gold-text",
    "--ro-gold-light": "--ro-gold-text",
  },
  fondo: {
    "--ro-chrome-bg": "--ro-bg-base",
    "--ro-chrome-deep": "--ro-bg-deep",
    "--ro-text-primary": "--ro-bg-card",
    "--ro-text-secondary": "--ro-bg-inset",
    "--ro-text-muted": "--ro-bg-inset",
    "--ro-gold": "--ro-gold-dim",
    "--ro-gold-light": "--ro-gold-dim",
    "--ro-error": "--ro-error-dim",
    "--ro-success": "--ro-success-dim",
  },
  borde: {
    "--ro-text-primary": "--ro-border-strong",
    "--ro-text-secondary": "--ro-border",
    "--ro-text-muted": "--ro-border",
    "--ro-bg-card": "--ro-border",
    "--ro-bg-inset": "--ro-border",
    "--ro-chrome-bg": "--ro-border-strong",
    "--ro-gold": "--ro-gold-border",
  },
};

/* ── Bloques donde el fondo sigue siendo oscuro: no tocar. ── */
const DARK_SCOPE = /\.ro-chrome|hack-padel|\.riviera-sidebar|\.mobile-app-navigation/;

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n.startsWith(".")) continue;
    const p = join(dir, n);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}

const DECL = /(^|[;{]\s*)([a-zA-Z-]+)\s*:\s*([^;{}]+)/g;
const files = walk(SRC).filter((f) => extname(f) === ".css");

let changes = 0;
let touched = 0;
const manual = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  let n = 0;

  const out = src.replace(DECL, (full, lead, prop, value, offset) => {
    const role = roleOf(prop);
    if (role === "otro" || role === "sombra") return full;

    /* ¿Está dentro de un scope oscuro? Mira el selector más cercano atrás. */
    const head = src.slice(Math.max(0, offset - 400), offset);
    const sel = head.lastIndexOf("}") + 1;
    if (DARK_SCOPE.test(head.slice(sel))) return full;

    let v = value;

    if (REPAIR) {
      v = v.replace(/var\(\s*(--ro-[a-z0-9-]+)\s*\)/gi, (m, tok) => {
        const fix = V1_BAD[role]?.[tok];
        if (!fix) return m;
        n++;
        return `var(${fix})`;
      });
    } else {
      v = v.replace(/#[0-9a-fA-F]{3,8}\b/g, (hex) => {
        if (hex.length === 9) return hex;
        let k = hex.toLowerCase();
        if (k.length === 4) k = "#" + [...k.slice(1)].map((c) => c + c).join("");
        const tok = MAP[k]?.[role];
        if (!tok) {
          manual.push(`${file}  ${prop}: ${hex}`);
          return hex;
        }
        n++;
        return `var(${tok})`;
      });
    }

    return v === value ? full : `${lead}${prop}: ${v}`;
  });

  if (n > 0) {
    changes += n;
    touched++;
    console.log(`${String(n).padStart(4)}  ${file}`);
    if (WRITE) writeFileSync(file, out, "utf8");
  }
}

console.log(
  `\n${changes} ${REPAIR ? "reparaciones" : "reemplazos"} en ${touched} archivos ` +
    (WRITE ? "(escritos)" : "(simulacro — usa --write)")
);

if (manual.length) {
  console.log(`\n${manual.length} sin mapear — decidir a mano:`);
  const byHex = {};
  for (const m of manual) {
    const h = m.match(/#[0-9a-fA-F]+/)[0].toLowerCase();
    (byHex[h] ||= []).push(m);
  }
  for (const [h, list] of Object.entries(byHex).sort((a, b) => b[1].length - a[1].length).slice(0, 25))
    console.log(`${String(list.length).padStart(4)}  ${h}   ej: ${list[0]}`);
}
