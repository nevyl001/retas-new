#!/usr/bin/env node
/**
 * Migra colores hex hardcodeados a tokens --ro-*.
 *
 *   node migrar-tokens.mjs            → sólo reporta, no escribe
 *   node migrar-tokens.mjs --write    → aplica los cambios
 *   node migrar-tokens.mjs --write --src ./src
 *
 * Sólo toca .css. Los .ts/.tsx se reportan aparte porque ahí un hex
 * puede estar en lógica (canvas, generación de PDF, colores de equipo
 * en base de datos) y reemplazarlo a ciegas rompe cosas.
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const SRC = args.includes("--src") ? args[args.indexOf("--src") + 1] : "./src";

/* Hex viejo → token nuevo. Añade filas conforme aparezcan casos. */
const MAP = {
  "#000000": "var(--ro-chrome-bg)",
  "#0a0a0a": "var(--ro-chrome-deep)",
  "#0f0f0f": "var(--ro-bg-surface)",
  "#111111": "var(--ro-bg-card)",
  "#1a1a1a": "var(--ro-bg-inset)",
  "#2a2a2a": "var(--ro-border)",
  "#2f2f2f": "var(--ro-border-strong)",
  "#ffffff": "var(--ro-bg-card)",
  "#fafafa": "var(--ro-bg-surface)",
  "#f5f5f5": "var(--ro-bg-base)",
  "#a0a0a0": "var(--ro-text-secondary)",
  "#b8b8b8": "var(--ro-text-secondary)",
  "#7a7a7a": "var(--ro-text-muted)",
  "#71717a": "var(--ro-text-muted)",
  "#18181b": "var(--ro-text-primary)",
  "#101820": "var(--ro-text-primary)",
  "#27272a": "var(--ro-border-strong)",
  "#c9a227": "var(--ro-gold)",
  "#e8c547": "var(--ro-gold-light)",
  "#d4af37": "var(--ro-medal-gold)",
  "#fbbf24": "var(--ro-gold)",
  "#4ade80": "var(--ro-success)",
  "#86efac": "var(--ro-success)",
  "#34d399": "var(--ro-success)",
  "#10b981": "var(--ro-mode-americano)",
  "#f87171": "var(--ro-error)",
  "#fca5a5": "var(--ro-error)",
  "#fecaca": "var(--ro-error-dim)",
  "#ef4444": "var(--ro-error)",
  "#ff4444": "var(--ro-error)",
  "#fb923c": "var(--ro-mode-duelo)",
  "#3b82f6": "var(--ro-mode-liga)",
  "#8b5cf6": "var(--ro-mode-torneo)",
  "#555555": "var(--ro-pending)",
  "#94a3b8": "var(--ro-text-muted)",
};

/* Shorthands de 3 dígitos que hay que expandir antes de comparar. */
const expand = (h) =>
  h.length === 4 ? "#" + [...h.slice(1)].map((c) => c + c).join("") : h;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(SRC);
const cssFiles = files.filter((f) => extname(f) === ".css");
const codeFiles = files.filter((f) => [".ts", ".tsx"].includes(extname(f)));

let touched = 0;
let replaced = 0;
const unmapped = new Map();

for (const file of cssFiles) {
  const before = readFileSync(file, "utf8");
  let count = 0;

  const after = before.replace(/#[0-9a-fA-F]{3,8}\b/g, (hex) => {
    /* 8 dígitos = hex con alpha; se deja, no hay token equivalente. */
    if (hex.length === 9) return hex;
    const key = expand(hex).toLowerCase();
    const token = MAP[key];
    if (!token) {
      unmapped.set(key, (unmapped.get(key) || 0) + 1);
      return hex;
    }
    count++;
    return token;
  });

  if (count > 0) {
    replaced += count;
    touched++;
    console.log(`${count.toString().padStart(4)}  ${file}`);
    if (WRITE) writeFileSync(file, after, "utf8");
  }
}

console.log(
  `\n${replaced} reemplazos en ${touched} archivos CSS ${
    WRITE ? "(escritos)" : "(simulacro — usa --write para aplicar)"
  }`
);

const pending = [...unmapped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
if (pending.length) {
  console.log(`\nSin mapear (top 25) — decide token o déjalos:`);
  for (const [hex, n] of pending)
    console.log(`${n.toString().padStart(4)}  ${hex}`);
}

const codeHits = codeFiles
  .map((f) => [f, (readFileSync(f, "utf8").match(/#[0-9a-fA-F]{6}\b/g) || []).length])
  .filter(([, n]) => n > 0)
  .sort((a, b) => b[1] - a[1]);

if (codeHits.length) {
  console.log(`\nHex en .ts/.tsx — revisar a mano (${codeHits.length} archivos):`);
  for (const [f, n] of codeHits.slice(0, 20))
    console.log(`${n.toString().padStart(4)}  ${f}`);
}
