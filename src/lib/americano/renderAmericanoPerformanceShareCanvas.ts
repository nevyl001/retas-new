import {
  computeStandingDif,
  formatStandingDif,
} from "../../utils/standingsDisplay";

export const AMERICANO_SHARE_WIDTH = 1080;
export const AMERICANO_SHARE_HEIGHT = 1920;

export type AmericanoPerformanceSharePayload = {
  playerName: string;
  position: number;
  isFinished: boolean;
  eventName?: string | null;
  clubName?: string | null;
  fotoUrl?: string | null;
  pj: number;
  pg: number;
  pp: number;
  pe: number;
  pointsFor: number;
  pointsAgainst: number;
  /** PTS informativos del mapa live (PG×2); no ordena. */
  puntos: number;
  themePrimary?: string;
  themeAccent?: string;
};

/** Equivalente canvas de object-fit: cover. */
export function computeCoverCrop(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): { sx: number; sy: number; sw: number; sh: number } {
  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) {
    return { sx: 0, sy: 0, sw: Math.max(0, srcW), sh: Math.max(0, srcH) };
  }
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  if (srcRatio > dstRatio) {
    const sw = srcH * dstRatio;
    const sx = (srcW - sw) / 2;
    return { sx, sy: 0, sw, sh: srcH };
  }
  const sh = srcW / dstRatio;
  // Anclar arriba (cabeza/rostro visible); sin empujar el crop hacia abajo.
  return { sx: 0, sy: 0, sw: srcW, sh };
}

export function initialsFromPlayerName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

/** Etiqueta de posición para la tarjeta compartible. */
export function buildAmericanoSharePlaceLabel(input: {
  position: number;
  isFinished: boolean;
}): { placeLine: string; badge: string | null } {
  const pos = Math.max(1, Math.floor(input.position));
  if (input.isFinished && pos === 1) {
    return { placeLine: `#${pos}`, badge: "GANADOR" };
  }
  if (!input.isFinished) {
    return { placeLine: `#${pos}`, badge: "CLASIFICACIÓN EN VIVO" };
  }
  return { placeLine: `#${pos}`, badge: "CLASIFICACIÓN" };
}

export function buildAmericanoShareFileName(playerName: string): string {
  const slug = playerName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `americano-desempeno${slug ? `-${slug}` : ""}.png`;
}

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = url;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawFallbackBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  primary: string,
  accent: string,
  initials: string
) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, primary);
  grad.addColorStop(0.55, "#0a0a0a");
  grad.addColorStop(1, "#050505");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const radial = ctx.createRadialGradient(
    w * 0.5,
    h * 0.22,
    40,
    w * 0.5,
    h * 0.22,
    w * 0.7
  );
  radial.addColorStop(0, accent);
  radial.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = 1;

  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.font = "700 220px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initials, w / 2, h * 0.38);
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number
) {
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const crop = computeCoverCrop(srcW, srcH, w, h);
  ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);
}

function drawOverlay(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const top = ctx.createLinearGradient(0, 0, 0, h * 0.32);
  top.addColorStop(0, "rgba(0,0,0,0.42)");
  top.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, w, h * 0.32);

  // Deja el tercio medio más limpio (rostro) y refuerza solo el bloque inferior de texto.
  const bottom = ctx.createLinearGradient(0, h * 0.38, 0, h);
  bottom.addColorStop(0, "rgba(0,0,0,0.05)");
  bottom.addColorStop(0.35, "rgba(0,0,0,0.35)");
  bottom.addColorStop(0.62, "rgba(0,0,0,0.78)");
  bottom.addColorStop(1, "rgba(0,0,0,0.94)");
  ctx.fillStyle = bottom;
  ctx.fillRect(0, h * 0.38, w, h * 0.62);
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("png_encode_failed"));
      },
      "image/png"
    );
  });
}

/**
 * Compone la tarjeta 9:16 del desempeño Americano (Canvas 2D).
 * No usa DOM screenshot. Si la foto falla (CORS/red), usa fallback.
 */
export async function renderAmericanoPerformanceSharePng(
  payload: AmericanoPerformanceSharePayload
): Promise<Blob> {
  const w = AMERICANO_SHARE_WIDTH;
  const h = AMERICANO_SHARE_HEIGHT;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const primary = payload.themePrimary?.trim() || "#141414";
  const accent = payload.themeAccent?.trim() || "rgba(255,255,255,0.35)";
  const initials = initialsFromPlayerName(payload.playerName);
  const foto = payload.fotoUrl?.trim() || "";

  let drewPhoto = false;
  if (foto) {
    try {
      const img = await loadImageFromUrl(foto);
      drawCoverImage(ctx, img, w, h);
      drewPhoto = true;
    } catch {
      drewPhoto = false;
    }
  }
  if (!drewPhoto) {
    drawFallbackBackground(ctx, w, h, primary, accent, initials);
  }

  drawOverlay(ctx, w, h);

  // Márgenes seguros para Instagram Stories (UI nativa arriba/abajo).
  const padX = 80;
  const safeTop = 150;
  const safeBottom = 130;
  let y = safeTop;

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,0.62)";
  ctx.font = "700 28px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText("AMERICANO", padX, y);

  const eventName = payload.eventName?.trim() || "";
  if (eventName) {
    y += 50;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "600 34px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(
      truncateText(ctx, eventName.toUpperCase(), w - padX * 2),
      padX,
      y
    );
  }

  const clubName = payload.clubName?.trim() || "";
  if (clubName && clubName.toLowerCase() !== eventName.toLowerCase()) {
    y += 38;
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "600 26px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(truncateText(ctx, clubName, w - padX * 2), padX, y);
  }

  const name = payload.playerName.trim() || "Jugador";
  const place = buildAmericanoSharePlaceLabel({
    position: payload.position,
    isFinished: payload.isFinished,
  });

  // Composición inferior de abajo hacia arriba para evitar cortes con nombres largos.
  const footerY = h - safeBottom;
  const cardH = 100;
  const cardTop = footerY - 56 - cardH;
  const metricsY = cardTop - 36;

  ctx.font = "800 88px system-ui, -apple-system, Segoe UI, sans-serif";
  const nameLines = wrapText(ctx, name.toUpperCase(), w - padX * 2, 2);
  const nameBlockH = nameLines.length * 92;
  const placeBlockH = 118 + (place.badge ? 44 : 0);
  let nameStartY = metricsY - 48 - placeBlockH - nameBlockH + 88;
  // No invadir el bloque superior (evento/club).
  const minNameY = y + 120;
  if (nameStartY < minNameY) nameStartY = minNameY;

  let blockY = nameStartY;
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 88px system-ui, -apple-system, Segoe UI, sans-serif";
  for (const line of nameLines) {
    ctx.fillText(line, padX, blockY);
    blockY += 92;
  }

  blockY += 8;
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 104px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(place.placeLine, padX, blockY);

  if (place.badge) {
    blockY += 44;
    const isWinner = place.badge === "GANADOR";
    ctx.fillStyle = isWinner
      ? "rgba(201, 162, 39, 0.95)"
      : "rgba(255,255,255,0.55)";
    ctx.font = "700 26px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(
      truncateText(ctx, place.badge, w - padX * 2),
      padX,
      blockY
    );
  }

  const lineParts = [
    `${payload.pj} PJ`,
    `${payload.pg} PG`,
    `${payload.pp} PP`,
  ];
  if (payload.pe > 0) lineParts.push(`${payload.pe} PE`);
  if (payload.puntos > 0) lineParts.push(`${payload.puntos} PTS`);
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = "600 32px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(
    truncateText(ctx, lineParts.join("  ·  "), w - padX * 2),
    padX,
    metricsY
  );

  const dif = formatStandingDif(
    computeStandingDif(payload.pointsFor, payload.pointsAgainst)
  );
  const statCards: Array<{ label: string; value: string }> = [
    { label: "FAV", value: String(payload.pointsFor) },
    { label: "CON", value: String(payload.pointsAgainst) },
    { label: "DIF", value: dif },
  ];
  const cardW = (w - padX * 2 - 28) / 3;
  const cardY = cardTop;
  statCards.forEach((card, i) => {
    const x = padX + i * (cardW + 14);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundRect(ctx, x, cardY, cardW, cardH, 18);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "700 22px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(card.label, x + 22, cardY + 36);
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 42px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(
      truncateText(ctx, card.value, cardW - 40),
      x + 22,
      cardY + 78
    );
  });

  ctx.fillStyle = "rgba(255,255,255,0.38)";
  ctx.font = "600 24px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("by RIVIERA OPEN", w / 2, footerY);

  return canvasToPngBlob(canvas);
}

function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = truncateText(ctx, words[0], maxWidth);
  for (let i = 1; i < words.length; i += 1) {
    const word = truncateText(ctx, words[i], maxWidth);
    const next = `${current} ${word}`;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines - 1) {
        const rest = [current, ...words.slice(i + 1)].join(" ");
        lines.push(truncateText(ctx, rest, maxWidth));
        return lines;
      }
    }
  }
  lines.push(current);
  return lines.slice(0, maxLines);
}
