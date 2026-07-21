#!/usr/bin/env node
/**
 * Fase 2 — migra overlays rgba(255,255,255,α) y rgba(0,0,0,α) a tokens --ro-*
 * SEGÚN EL ROL de la propiedad CSS en que aparecen (no por el valor de alpha).
 *
 *   node migrar-overlays.mjs <archivo.css> [<archivo.css> ...]            → simulacro
 *   node migrar-overlays.mjs --write <archivo.css> [...]                  → aplica
 *
 * Reglas (superficie CLARA; NO usar en archivos de superficie oscura):
 *   background* :  blanco       α<0.05 → --ro-bg-inset ; α≥0.05 → --ro-bg-elevated
 *                  oscuro (negro puro o gris oscuro no puro, máx canal ≤64):
 *                               α≥0.85 → --ro-bg-elevated (superficie sólida)
 *                               α<0.85 → --ro-scrim-modal  (scrim de modal)
 *   border / outline / stroke : blanco α<0.1 → --ro-border-subtle ; α≥0.1 → --ro-border
 *                               negro → --ro-border-strong
 *   color :        blanco  α≥0.7 → --ro-text-secondary ; α<0.7 → --ro-text-muted
 *                  negro   → --ro-text-primary
 *   box-shadow/text-shadow :
 *                  blanco (solo capas de anillo) → --ro-accent-ring
 *                  negro sin inset → declaración COMPLETA = --ro-shadow-{sm|md|lg}
 *                          (por blur máx: ≥32→lg, ≥10→md, resto→sm). No se
 *                          conserva alfa ni capas de glow: un alfa alto sobre
 *                          hueso se ve como mancha, no como sombra.
 *                  negro con inset → tinta recalibrada a rgba(20,22,26,α)
 *                          (sombra interior, no es el problema de la mancha)
 *
 * Aborta si el archivo contiene scope .ro-chrome o hack-padel (ahí no se toca).
 */
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const files = args.filter((a) => a !== "--write");

const WHITE = /rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)/i;
const BLACK = /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*([\d.]+)\s*\)/i;
// rgba genérico con sus tres canales, para detectar superficies oscuras no puras
const RGBA = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/gi;
const isDarkChannels = (r, g, b) => Math.max(+r, +g, +b) <= 64;

function roleOf(prop) {
  if (/^background/.test(prop)) return "bg";
  if (/^(border|outline|column-rule|stroke)/.test(prop)) return "border";
  if (prop === "color" || prop === "-webkit-text-fill-color") return "text";
  if (/box-shadow$/.test(prop) || prop === "text-shadow") return "shadow";
  return null;
}

function shadowSizeToken(value) {
  const px = [...value.matchAll(/(-?\d*\.?\d+)px/g)].map((m) => Math.abs(parseFloat(m[1])));
  const max = px.length ? Math.max(...px) : 0;
  if (max >= 32) return "var(--ro-shadow-lg)";
  if (max >= 10) return "var(--ro-shadow-md)";
  return "var(--ro-shadow-sm)";
}

/**
 * Mira hacia adelante desde la posición del `:` y decide si es un separador de
 * declaración (propiedad: valor) o el `:` de una pseudo-clase de selector.
 * Devuelve el terminador que aparece primero a nivel de paréntesis 0: uno de
 * ";", "}" (declaración) o "{" (selector) — respetando parens y strings.
 */
function firstTopLevelTerminator(css, from) {
  let j = from, paren = 0;
  const n = css.length;
  while (j < n) {
    const d = css[j];
    if (d === '"' || d === "'") {
      const q = css.indexOf(d, j + 1);
      j = q === -1 ? n : q + 1;
      continue;
    }
    if (d === "/" && css[j + 1] === "*") {
      const e = css.indexOf("*/", j + 2);
      j = e === -1 ? n : e + 2;
      continue;
    }
    if (d === "(") paren++;
    else if (d === ")") paren--;
    else if (paren === 0 && (d === ";" || d === "}" || d === "{")) return d;
    j++;
  }
  return ";";
}

/** Divide una hoja en segmentos {type:'decl'|'other'}, con parser consciente de
 *  paréntesis, strings, comentarios y pseudo-clases de selector. */
function splitDeclarations(css) {
  const segs = [];
  let i = 0, n = css.length, brace = 0, paren = 0;
  let buf = "";
  const flushOther = () => { if (buf) { segs.push({ type: "other", text: buf }); buf = ""; } };
  while (i < n) {
    const c = css[i];
    // comentarios
    if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      const j = end === -1 ? n : end + 2;
      buf += css.slice(i, j); i = j; continue;
    }
    // strings a nivel de estructura (p.ej. selectores de atributo)
    if (c === '"' || c === "'") {
      const q = css.indexOf(c, i + 1); const k = q === -1 ? n : q + 1;
      buf += css.slice(i, k); i = k; continue;
    }
    if (c === "(") { paren++; buf += c; i++; continue; }
    if (c === ")") { paren--; buf += c; i++; continue; }
    if (c === "{") { brace++; buf += c; i++; continue; }
    if (c === "}") { brace--; buf += c; i++; continue; }
    if (
      brace > 0 && paren === 0 && c === ":" &&
      /[-a-zA-Z]/.test(css[i - 1] || "") &&
      firstTopLevelTerminator(css, i + 1) !== "{"
    ) {
      const m = buf.match(/([-a-zA-Z]+)\s*$/);
      if (m) {
        // leer valor hasta ; o } (o { por seguridad) respetando parens/strings
        let j = i + 1, p = 0, val = "";
        while (j < n) {
          const d = css[j];
          if (d === "(") p++;
          else if (d === ")") p--;
          else if (d === '"' || d === "'") {
            const q = css.indexOf(d, j + 1); const k = q === -1 ? n : q + 1;
            val += css.slice(j, k); j = k; continue;
          } else if ((d === ";" || d === "}" || d === "{") && p === 0) break;
          val += d; j++;
        }
        buf = buf.slice(0, buf.length - m[1].length);
        flushOther();
        const term = css[j] === ";" ? ";" : "";
        segs.push({ type: "decl", prop: m[1].toLowerCase(), pre: m[1] + ":", value: val, term });
        i = term ? j + 1 : j;
        continue;
      }
    }
    buf += c; i++;
  }
  flushOther();
  return segs;
}

let totalReplaced = 0, totalFlagged = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  if (/\.ro-chrome\b|\.ro-surface-dark\b|hack-padel|\.duelo2v2-page\b|\.riviera-sidebar\b|\.mobile-app-navigation\b|\.ro-public-view\b|\.te-public\b|\.rjp-public\b|\.liga-pantalla\b/.test(src)) {
    console.log(`SKIP (superficie oscura declarada): ${file}`);
    continue;
  }
  const segs = splitDeclarations(src);
  let replaced = 0; const flags = [];
  for (const s of segs) {
    if (s.type !== "decl") continue;
    const role = roleOf(s.prop);
    let v = s.value;
    if (!/rgba\(/i.test(v)) continue;
    const hasBW = WHITE.test(v) || BLACK.test(v);
    if (!role) {
      if (hasBW) flags.push(`${s.prop}:${v.trim()}  (rol desconocido)`);
      continue;
    }

    if (role === "shadow") {
      if (!hasBW) continue;
      const hasInset = /\binset\b/.test(v);
      const hasBlack = BLACK.test(v);
      const token = shadowSizeToken(v);
      if (hasBlack && !hasInset) {
        // Sombra de caída (negra, pura o mezclada con glow): se reemplaza la
        // declaración COMPLETA por el token de elevación. No se conserva alfa
        // ni capas de color — decisión #4: la mancha sobre hueso no es sombra.
        v = " " + token;
        replaced++;
      } else {
        // blanco = anillo/realce; negro con inset = sombra interior (recalibrar)
        v = v.replace(new RegExp(WHITE.source, "gi"), () => { replaced++; return "var(--ro-accent-ring)"; });
        if (hasBlack) {
          v = v.replace(new RegExp(BLACK.source, "gi"), (_m, a) => { replaced++; return `rgba(20, 22, 26, ${a})`; });
        }
      }
    } else if (role === "bg") {
      // blanco → inset / elevated según opacidad
      v = v.replace(new RegExp(WHITE.source, "gi"), (_m, a) => {
        replaced++;
        return parseFloat(a) < 0.05 ? "var(--ro-bg-inset)" : "var(--ro-bg-elevated)";
      });
      // superficie oscura (negro puro o gris oscuro no puro) → regla por alpha (#2)
      v = v.replace(RGBA, (m, r, g, b, a) => {
        if (!isDarkChannels(r, g, b)) return m;
        replaced++;
        return parseFloat(a) >= 0.85 ? "var(--ro-bg-elevated)" : "var(--ro-scrim-modal)";
      });
    } else if (role === "border") {
      v = v.replace(new RegExp(WHITE.source, "gi"), (_m, a) => {
        replaced++;
        return parseFloat(a) < 0.1 ? "var(--ro-border-subtle)" : "var(--ro-border)";
      });
      v = v.replace(new RegExp(BLACK.source, "gi"), () => { replaced++; return "var(--ro-border-strong)"; });
    } else if (role === "text") {
      v = v.replace(new RegExp(WHITE.source, "gi"), (_m, a) => {
        replaced++;
        return parseFloat(a) >= 0.7 ? "var(--ro-text-secondary)" : "var(--ro-text-muted)";
      });
      v = v.replace(new RegExp(BLACK.source, "gi"), () => { replaced++; return "var(--ro-text-primary)"; });
    }
    s.value = v;
  }
  const out = segs.map((s) => (s.type === "other" ? s.text : s.pre + s.value + s.term)).join("");
  totalReplaced += replaced; totalFlagged += flags.length;
  console.log(`${String(replaced).padStart(4)}  ${file}${WRITE ? "  (escrito)" : ""}`);
  for (const f of flags) console.log(`        flag: ${f}`);
  if (WRITE && replaced) writeFileSync(file, out, "utf8");
}
console.log(`\n${totalReplaced} reemplazos, ${totalFlagged} flags ${WRITE ? "(escritos)" : "(simulacro)"}`);
