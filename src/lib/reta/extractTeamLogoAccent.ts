/**
 * Extrae un acento de UI a partir del logo de un equipo (color dominante
 * cromático). Mientras carga / sin logo: neutro (evita flasheo amarillo/rojo).
 */

export type Rgb = { r: number; g: number; b: number };

/** Neutro de espera — no usar amarillo/coral legacy (causaba flash en móvil). */
export const PENDING_TEAM_ACCENT: Rgb = { r: 180, g: 184, b: 196 };

/** @deprecated Preferir PENDING_TEAM_ACCENT; se mantiene por compat. */
export const DEFAULT_TEAM_A_ACCENT: Rgb = PENDING_TEAM_ACCENT;
/** @deprecated Preferir PENDING_TEAM_ACCENT; se mantiene por compat. */
export const DEFAULT_TEAM_B_ACCENT: Rgb = PENDING_TEAM_ACCENT;

const SAMPLE_SIZE = 48;
const BUCKET = 24;
const STORAGE_KEY = "reta-eq-logo-accent-v1";

const accentCache = new Map<string, Rgb | null>();

export function rgbToCssTriplet(rgb: Rgb): string {
  return `${rgb.r}, ${rgb.g}, ${rgb.b}`;
}

export function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function isRgb(value: unknown): value is Rgb {
  if (!value || typeof value !== "object") return false;
  const v = value as Rgb;
  return (
    typeof v.r === "number" &&
    typeof v.g === "number" &&
    typeof v.b === "number"
  );
}

function readSessionAccent(url: string): Rgb | null | undefined {
  if (typeof sessionStorage === "undefined") return undefined;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const map = JSON.parse(raw) as Record<string, Rgb | null>;
    if (!Object.prototype.hasOwnProperty.call(map, url)) return undefined;
    const entry = map[url];
    if (entry === null) return null;
    if (isRgb(entry)) {
      return {
        r: clampByte(entry.r),
        g: clampByte(entry.g),
        b: clampByte(entry.b),
      };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function writeSessionAccent(url: string, accent: Rgb | null): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const map = (raw ? JSON.parse(raw) : {}) as Record<string, Rgb | null>;
    map[url] = accent;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode */
  }
}

function rememberAccent(url: string, accent: Rgb | null): void {
  accentCache.set(url, accent);
  writeSessionAccent(url, accent);
}

/**
 * Lectura síncrona (memoria + sessionStorage) para pintar sin flash.
 * `undefined` = aún no conocido.
 */
export function peekCachedAccentFromLogoUrl(
  url: string | null | undefined
): Rgb | null | undefined {
  const trimmed = typeof url === "string" ? url.trim() : "";
  if (!trimmed) return null;
  if (accentCache.has(trimmed)) return accentCache.get(trimmed);
  const fromSession = readSessionAccent(trimmed);
  if (fromSession !== undefined) {
    accentCache.set(trimmed, fromSession);
    return fromSession;
  }
  return undefined;
}

/** Resuelve acento inmediato para UI: cache → neutro. */
export function resolveAccentForPaint(
  url: string | null | undefined
): Rgb {
  const peeked = peekCachedAccentFromLogoUrl(url);
  if (peeked) return peeked;
  return PENDING_TEAM_ACCENT;
}

/** RGB → HSL (h 0–360, s/l 0–1). */
export function rgbToHsl(rgb: Rgb): { h: number; s: number; l: number } {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    default:
      h = ((r - g) / d + 4) / 6;
  }
  return { h: h * 360, s, l };
}

function hue2rgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
  if (s === 0) {
    const v = clampByte(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hh = (((h % 360) + 360) % 360) / 360;
  return {
    r: clampByte(hue2rgb(p, q, hh + 1 / 3) * 255),
    g: clampByte(hue2rgb(p, q, hh) * 255),
    b: clampByte(hue2rgb(p, q, hh - 1 / 3) * 255),
  };
}

/** Asegura contraste y presencia en UI oscura (glow / tipografía). */
export function boostAccentForUi(rgb: Rgb): Rgb {
  const { h, s, l } = rgbToHsl(rgb);
  const nextS = Math.max(0.55, Math.min(0.92, s < 0.2 ? 0.62 : s * 1.15));
  const nextL = Math.max(
    0.42,
    Math.min(0.62, l < 0.3 ? 0.48 : l > 0.7 ? 0.52 : l)
  );
  return hslToRgb(h, nextS, nextL);
}

function isUsablePixel(r: number, g: number, b: number, a: number): boolean {
  if (a < 140) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 28) return false;
  if (min > 245) return false;
  if (max - min < 18) return false;
  return true;
}

type Bucket = {
  sumR: number;
  sumG: number;
  sumB: number;
  count: number;
  score: number;
};

/**
 * Elige el color cromático más representativo de ImageData (RGBA).
 * Exportado para tests unitarios sin canvas/DOM.
 */
export function pickDominantFromImageData(
  data: Uint8ClampedArray | Uint8Array
): Rgb | null {
  const buckets = new Map<string, Bucket>();

  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const a = data[i + 3]!;
    if (!isUsablePixel(r, g, b, a)) continue;

    const qr = Math.round(r / BUCKET) * BUCKET;
    const qg = Math.round(g / BUCKET) * BUCKET;
    const qb = Math.round(b / BUCKET) * BUCKET;
    const key = `${qr},${qg},${qb}`;
    const { s, l } = rgbToHsl({ r, g, b });
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    const lightPenalty = l < 0.18 || l > 0.82 ? 0.35 : 1;
    const weight = (0.35 + s) * (0.4 + chroma / 255) * lightPenalty;

    const prev = buckets.get(key);
    if (prev) {
      prev.sumR += r;
      prev.sumG += g;
      prev.sumB += b;
      prev.count += 1;
      prev.score += weight;
    } else {
      buckets.set(key, {
        sumR: r,
        sumG: g,
        sumB: b,
        count: 1,
        score: weight,
      });
    }
  }

  let bestKey: string | null = null;
  let bestScore = -1;
  buckets.forEach((entry, key) => {
    if (entry.score > bestScore) {
      bestScore = entry.score;
      bestKey = key;
    }
  });
  if (!bestKey) return null;
  const best = buckets.get(bestKey);
  if (!best || best.count === 0) return null;

  return boostAccentForUi({
    r: best.sumR / best.count,
    g: best.sumG / best.count,
    b: best.sumB / best.count,
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("logo load failed"));
    img.src = url;
  });
}

/**
 * Extrae acento desde URL del logo. Cachea por URL (memoria + sessionStorage).
 * Devuelve null si falla (CORS, imagen inválida, sin color útil).
 */
export async function extractAccentFromLogoUrl(
  url: string | null | undefined
): Promise<Rgb | null> {
  const trimmed = typeof url === "string" ? url.trim() : "";
  if (!trimmed) return null;

  const peeked = peekCachedAccentFromLogoUrl(trimmed);
  if (peeked !== undefined) return peeked;

  try {
    const img = await loadImage(trimmed);
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_SIZE;
    canvas.height = SAMPLE_SIZE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      rememberAccent(trimmed, null);
      return null;
    }
    ctx.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const accent = pickDominantFromImageData(data);
    rememberAccent(trimmed, accent);
    return accent;
  } catch {
    rememberAccent(trimmed, null);
    return null;
  }
}

/** Solo tests / hot reload. */
export function clearTeamLogoAccentCache(): void {
  accentCache.clear();
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
