/** Formato de nombres para tarjetas públicas de jornada (solo presentación). */

export function compactPlayerName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "?") return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return trimmed;
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (last.length <= 2) return `${first} ${last}`;
  return `${first} ${last.charAt(0).toUpperCase()}.`;
}

export function formatPairCompactLine(name1: string, name2: string): string {
  return `${compactPlayerName(name1)} / ${compactPlayerName(name2)}`;
}

export function pairInitials(name1: string, name2: string): string {
  const i1 = name1.trim().charAt(0).toUpperCase() || "?";
  const i2 = name2.trim().charAt(0).toUpperCase() || "?";
  return `${i1}${i2}`;
}

/** Nombre + apellido para layout de 2 líneas (sin truncar). */
export function splitPlayerDisplayName(name: string): {
  primary: string;
  secondary: string | null;
} {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "?") return { primary: "?", secondary: null };
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { primary: trimmed, secondary: null };
  return {
    primary: parts[0]!,
    secondary: parts.slice(1).join(" "),
  };
}

function hashPlayerName(name: string): number {
  const key = name.trim().toLowerCase() || "?";
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Fondo tipo jersey deportivo: 3 stops derivados del hash + radial highlight.
 */
export function playerAvatarHashTone(name: string): {
  background: string;
  color: string;
} {
  const hash = hashPlayerName(name);
  const hue = hash % 360;
  const h1 = hue;
  const h2 = (hue + 18) % 360;
  const h3 = (hue + 40) % 360;
  return {
    background: [
      `radial-gradient(ellipse 85% 65% at 50% -8%, hsl(${h1} 38% 42%) 0%, transparent 68%)`,
      `linear-gradient(152deg, hsl(${h1} 34% 24%) 0%, hsl(${h2} 30% 17%) 52%, hsl(${h3} 28% 11%) 100%)`,
    ].join(", "),
    color: `hsl(${hue} 16% 92%)`,
  };
}

/** Etiqueta de set para broadcast (S1 → SET 1). */
export function formatSetColumnLabel(label: string): string {
  const raw = label.trim().toUpperCase();
  if (raw === "STB" || raw === "SUPER") return "STB";
  if (raw === "PTS") return "PTS";
  const m = raw.match(/^S(\d+)$/);
  if (m) return `SET ${m[1]}`;
  return raw;
}

/**
 * URL candidata a foto real para Split VS.
 * Descarta avatares sintéticos / generadores de ilustración conocidos.
 */
export function isPhotographicSplitVsFoto(
  url: string | null | undefined
): boolean {
  const raw = url?.trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (lower.startsWith("data:image/svg")) return false;
  if (
    /dicebear\.com|api\.dicebear|multiavatar\.com|boringavatars|avataaars\.io|ui-avatars\.com|robohash\.org|adorable\.io|readyplayer\.me|personas\.draftbit|notion-avatar|toonme\.com|getavataaars|cartoonify|\/memoji\b|\.svg(\?|$)/i.test(
      lower
    )
  ) {
    return false;
  }
  return true;
}

export const SPLIT_VS_MIN_SIDE_PX = 200;
export const SPLIT_VS_MIN_RATIO = 0.88;
export const SPLIT_VS_MAX_RATIO = 1.12;

/** Validación de tamaño mínimo usada por el guardia temporal. */
export function hasMinDimensionsForSplitVs(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  return Math.min(width, height) >= SPLIT_VS_MIN_SIDE_PX;
}

/** Validación de proporción cercana a cuadrado usada por el guardia temporal. */
export function hasSquareRatioForSplitVs(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  const ratio = width / height;
  return ratio >= SPLIT_VS_MIN_RATIO && ratio <= SPLIT_VS_MAX_RATIO;
}

/** Backward-compatible alias used by existing tests/components. */
export function isSquareEnoughForSplitVs(width: number, height: number): boolean {
  return (
    hasMinDimensionsForSplitVs(width, height) &&
    hasSquareRatioForSplitVs(width, height)
  );
}

/**
 * Heurística: avatares cartoon/3D suelen tener esquinas claras y uniformes
 * (fondo de estudio). Fotos reales de cancha casi nunca.
 */
export function inspectStudioIllustrationSignal(
  img: HTMLImageElement
): {
  passed: boolean;
  isLikelyIllustration: boolean;
  lightCorners: number | null;
  threshold: number;
  sampleSize: number;
  reason: string;
} {
  const sampleSize = 32;
  const threshold = 3;
  try {
    const w = sampleSize;
    const h = sampleSize;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      return {
        passed: false,
        isLikelyIllustration: false,
        lightCorners: null,
        threshold,
        sampleSize,
        reason: "canvas_unavailable",
      };
    }
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    const corners: Array<[number, number]> = [
      [0, 0],
      [w - 4, 0],
      [0, h - 4],
      [w - 4, h - 4],
    ];
    let lightCorners = 0;
    for (const [cx, cy] of corners) {
      let sum = 0;
      let n = 0;
      for (let y = cy; y < cy + 4; y += 1) {
        for (let x = cx; x < cx + 4; x += 1) {
          const i = (y * w + x) * 4;
          sum += (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
          n += 1;
        }
      }
      if (n > 0 && sum / n >= 198) lightCorners += 1;
    }
    const isLikelyIllustration = lightCorners >= threshold;
    return {
      passed: true,
      isLikelyIllustration,
      lightCorners,
      threshold,
      sampleSize,
      reason: isLikelyIllustration ? "light_corner_pattern" : "texture_varied",
    };
  } catch (error) {
    return {
      passed: false,
      isLikelyIllustration: false,
      lightCorners: null,
      threshold,
      sampleSize,
      reason:
        error instanceof Error && error.message
          ? `canvas_error:${error.message}`
          : "canvas_error",
    };
  }
}

export function looksLikeStudioIllustrationAvatar(img: HTMLImageElement): boolean {
  return inspectStudioIllustrationSignal(img).isLikelyIllustration;
}

/** Compat: combina guardias (sin usarse durante rollback temporal). */
export function isUsableSplitVsPhoto(img: HTMLImageElement): boolean {
  return (
    hasMinDimensionsForSplitVs(img.naturalWidth, img.naturalHeight) &&
    hasSquareRatioForSplitVs(img.naturalWidth, img.naturalHeight) &&
    !looksLikeStudioIllustrationAvatar(img)
  );
}
