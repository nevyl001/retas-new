import { RIVIERA_SOCIAL_HANDLE } from "../rivieraBranding";

export const GROUP_WINNER_SHARE_WIDTH = 1080;
export const GROUP_WINNER_SHARE_HEIGHT = 1920;
export const WINNER_TAGLINE = "Juntos hasta lo más alto.";

export type GroupWinnerSharePlayer = {
  name: string;
  avatarUrl?: string | null;
};

export type GroupWinnerShareData = {
  tournamentName: string;
  clubName?: string | null;
  clubLogoUrl?: string | null;
  categoryName: string;
  groupName: string;
  pairName: string;
  player1: GroupWinnerSharePlayer;
  player2: GroupWinnerSharePlayer;
  position: number;
  points: number;
  played: number;
  wins: number;
  fav?: number;
  con?: number;
  diff: number;
  themePrimary?: string;
  themeAccent?: string;
};

type TextLine = { text: string; fontSize: number };

const STORY_LAYOUT = {
  safeTop: 124,
  safeBottom: 164,
  padX: 76,
  header: {
    tournamentY: 282,
    contextY: 332,
  },
  achievement: {
    detailY: 426,
    titleY: 548,
    copyY: 610,
  },
  players: {
    firstX: 326,
    secondX: 758,
    firstY: 842,
    secondY: 912,
    diameter: 292,
    firstNameY: 1025,
    secondNameY: 1095,
    nameWidth: 370,
  },
  stats: {
    top: 1212,
    valueY: 1334,
    labelY: 1384,
    bottom: 1438,
  },
  footer: {
    taglineTop: 1510,
    taglineY: 1584,
    socialTop: 1644,
    socialY: 1708,
  },
} as const;

export function formatSignedNumber(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

export function initialsFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "RO";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ""}${words[words.length - 1][0] ?? ""}`.toUpperCase();
}

export function slugifyGroupWinnerShareFileName(data: GroupWinnerShareData): string {
  const slug = [data.tournamentName, data.categoryName, data.groupName]
    .join("-")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return `riviera-open-${slug || "ganadores-de-grupo"}.png`;
}

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
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH };
  }
  const sh = srcW / dstRatio;
  return { sx: 0, sy: 0, sw: srcW, sh };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("avatar_load_failed"));
    image.src = url;
  });
}

function fontFamily(role: "heading" | "body"): string {
  if (typeof document === "undefined") {
    return 'system-ui, -apple-system, "Segoe UI", sans-serif';
  }
  const styles = getComputedStyle(document.documentElement);
  const properties =
    role === "heading"
      ? ["--ro-font-heading", "--font-heading", "--font-display"]
      : ["--ro-font-body", "--font-body"];
  for (const property of properties) {
    const family = styles.getPropertyValue(property).trim();
    if (family) return family;
  }
  return 'system-ui, -apple-system, "Segoe UI", sans-serif';
}

function font(
  weight: number,
  size: number,
  role: "heading" | "body" = "heading"
): string {
  return `${weight} ${size}px ${
    fontFamily(role)
  }`;
}

function ellipsizeText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let value = text.trim();
  while (value.length > 1 && ctx.measureText(`${value}…`).width > maxWidth) {
    value = value.slice(0, -1).trimEnd();
  }
  return `${value}…`;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let current = words[0];
  for (let i = 1; i < words.length; i += 1) {
    const candidate = `${current} ${words[i]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
      if (lines.length === maxLines - 1) {
        current = [current, ...words.slice(i + 1)].join(" ");
        break;
      }
    }
  }
  lines.push(current);
  const visible = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    visible[maxLines - 1] = `${visible[maxLines - 1]}…`;
  }
  return visible;
}

function textLinesToFit(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
  maxFont: number,
  minFont: number,
  weight = 700
): TextLine[] {
  for (let size = maxFont; size >= minFont; size -= 2) {
    ctx.font = font(weight, size);
    const lines = wrapText(ctx, text, maxWidth, maxLines);
    if (lines.length <= maxLines && lines.every((line) => ctx.measureText(line).width <= maxWidth)) {
      return lines.map((line) => ({ text: line, fontSize: size }));
    }
  }
  ctx.font = font(weight, minFont);
  const lines = wrapText(ctx, text, maxWidth, maxLines);
  return lines.map((line, index) => ({
    text:
      index === maxLines - 1 && ctx.measureText(line).width > maxWidth
        ? ellipsizeText(ctx, line, maxWidth)
        : line,
    fontSize: minFont,
  }));
}

function trackedTextWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  tracking: number
): number {
  return text.split("").reduce(
    (width, char, index, chars) =>
      width +
      ctx.measureText(char).width +
      (index < chars.length - 1 ? tracking : 0),
    0
  );
}

function drawTrackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number
): void {
  const chars = text.split("");
  let cursor = x;
  ctx.save();
  ctx.textAlign = "left";
  chars.forEach((char, index) => {
    ctx.fillText(char, cursor, y);
    cursor +=
      ctx.measureText(char).width + (index < chars.length - 1 ? tracking : 0);
  });
  ctx.restore();
}

function drawTextLines(
  ctx: CanvasRenderingContext2D,
  lines: TextLine[],
  x: number,
  startY: number,
  lineHeight: number,
  weight: number,
  role: "heading" | "body" = "heading"
): number {
  let y = startY;
  lines.forEach((line) => {
    ctx.font = font(weight, line.fontSize, role);
    ctx.fillText(line.text, x, y);
    y += line.fontSize * lineHeight;
  });
  return y;
}

function placementLabel(position: number): string {
  if (position === 1) return "PRIMER LUGAR";
  return `${position}º LUGAR`;
}

function parseCssRgb(color: string): [number, number, number] | null {
  const value = color.trim();
  const shortHex = value.match(/^#([\da-f])([\da-f])([\da-f])$/i);
  if (shortHex) {
    return shortHex.slice(1).map((channel) =>
      Number.parseInt(`${channel}${channel}`, 16)
    ) as [number, number, number];
  }
  const hex = value.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (hex) {
    return hex.slice(1).map((channel) =>
      Number.parseInt(channel, 16)
    ) as [number, number, number];
  }
  const rgb = value.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i
  );
  if (!rgb) return null;
  return rgb.slice(1, 4).map((channel) =>
    Math.max(0, Math.min(255, Number(channel)))
  ) as [number, number, number];
}

function relativeLuminance([red, green, blue]: [
  number,
  number,
  number,
]): number {
  const channels = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function resolveEditorialAccent(themeAccent?: string): string {
  const fallback = "#c9845c";
  const candidate = themeAccent?.trim();
  if (!candidate) return fallback;
  const rgb = parseCssRgb(candidate);
  if (!rgb) return candidate;
  const light = relativeLuminance(rgb);
  const dark = relativeLuminance([14, 14, 16]);
  const contrast = (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
  return contrast >= 2.25 ? candidate : fallback;
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.arcTo(x + width, y, x + width, y + r, r);
  ctx.lineTo(x + width, y + height - r);
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  ctx.lineTo(x + r, y + height);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

async function drawAvatar(
  ctx: CanvasRenderingContext2D,
  player: GroupWinnerSharePlayer,
  centerX: number,
  centerY: number,
  diameter: number,
  accent: string
) {
  const radius = diameter / 2;
  const portraitRadius = radius - 18;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.72)";
  ctx.shadowBlur = 42;
  ctx.shadowOffsetY = 20;
  ctx.fillStyle = "#090a0c";
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius + 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(247,243,237,0.1)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius + 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius + 1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#090a0c";
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius - 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, portraitRadius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  let image: HTMLImageElement | null = null;
  if (player.avatarUrl?.trim()) {
    try {
      image = await loadImage(player.avatarUrl.trim());
    } catch {
      image = null;
    }
  }
  if (image) {
    const crop = computeCoverCrop(
      image.naturalWidth || image.width,
      image.naturalHeight || image.height,
      portraitRadius * 2,
      portraitRadius * 2
    );
    ctx.drawImage(
      image,
      crop.sx,
      crop.sy,
      crop.sw,
      crop.sh,
      centerX - portraitRadius,
      centerY - portraitRadius,
      portraitRadius * 2,
      portraitRadius * 2
    );
  } else {
    const gradient = ctx.createRadialGradient(
      centerX - portraitRadius * 0.38,
      centerY - portraitRadius * 0.42,
      portraitRadius * 0.03,
      centerX + portraitRadius * 0.1,
      centerY + portraitRadius * 0.16,
      portraitRadius
    );
    gradient.addColorStop(0, "#4b4d52");
    gradient.addColorStop(0.22, "#303238");
    gradient.addColorStop(0.68, "#1b1d22");
    gradient.addColorStop(1, "#0c0d10");
    ctx.fillStyle = gradient;
    ctx.fillRect(
      centerX - portraitRadius,
      centerY - portraitRadius,
      portraitRadius * 2,
      portraitRadius * 2
    );
    const innerLight = ctx.createLinearGradient(
      centerX - portraitRadius,
      centerY - portraitRadius,
      centerX + portraitRadius,
      centerY + portraitRadius
    );
    innerLight.addColorStop(0, "rgba(247,243,237,0.11)");
    innerLight.addColorStop(0.5, "rgba(247,243,237,0)");
    innerLight.addColorStop(1, "rgba(0,0,0,0.18)");
    ctx.fillStyle = innerLight;
    ctx.fillRect(
      centerX - portraitRadius,
      centerY - portraitRadius,
      portraitRadius * 2,
      portraitRadius * 2
    );
    ctx.fillStyle = "#f7f3ed";
    ctx.font = font(820, 84);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 12;
    ctx.fillText(initialsFromName(player.name), centerX, centerY + 7);
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(247,243,237,0.22)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(centerX, centerY, portraitRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Cancha editorial en perspectiva: estructura la pieza sin parecer un diagrama. */
function drawPremiumPadelCourtBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  accent: string
): void {
  const leftTop = { x: 88, y: 684 };
  const rightTop = { x: width - 112, y: 628 };
  const rightBottom = { x: width + 26, y: 1512 };
  const leftBottom = { x: -34, y: 1594 };
  const midpoint = (a: typeof leftTop, b: typeof rightTop, ratio: number) => ({
    x: a.x + (b.x - a.x) * ratio,
    y: a.y + (b.y - a.y) * ratio,
  });

  const serviceTopLeft = midpoint(leftTop, leftBottom, 0.28);
  const serviceTopRight = midpoint(rightTop, rightBottom, 0.28);
  const netLeft = midpoint(leftTop, leftBottom, 0.53);
  const netRight = midpoint(rightTop, rightBottom, 0.53);
  const serviceBottomLeft = midpoint(leftTop, leftBottom, 0.77);
  const serviceBottomRight = midpoint(rightTop, rightBottom, 0.77);

  ctx.save();
  const courtWash = ctx.createLinearGradient(0, 670, width, 1510);
  courtWash.addColorStop(0, "rgba(247,243,237,0.012)");
  courtWash.addColorStop(0.52, "rgba(247,243,237,0.036)");
  courtWash.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = courtWash;
  ctx.beginPath();
  ctx.moveTo(leftTop.x, leftTop.y);
  ctx.lineTo(rightTop.x, rightTop.y);
  ctx.lineTo(rightBottom.x, rightBottom.y);
  ctx.lineTo(leftBottom.x, leftBottom.y);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 0.105;
  ctx.strokeStyle = "#f7f3ed";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(leftTop.x, leftTop.y);
  ctx.lineTo(rightTop.x, rightTop.y);
  ctx.lineTo(rightBottom.x, rightBottom.y);
  ctx.lineTo(leftBottom.x, leftBottom.y);
  ctx.closePath();
  ctx.stroke();
  [serviceTopLeft, netLeft, serviceBottomLeft].forEach((left, index) => {
    const right = [serviceTopRight, netRight, serviceBottomRight][index];
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
    ctx.stroke();
  });
  ctx.beginPath();
  ctx.moveTo((leftTop.x + rightTop.x) / 2, (leftTop.y + rightTop.y) / 2);
  ctx.lineTo(
    (leftBottom.x + rightBottom.x) / 2,
    (leftBottom.y + rightBottom.y) / 2
  );
  ctx.stroke();

  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(netLeft.x, netLeft.y);
  ctx.lineTo(netRight.x, netRight.y);
  ctx.stroke();

  ctx.globalAlpha = 0.09;
  ctx.strokeStyle = "#f7f3ed";
  ctx.lineWidth = 1;
  for (let offset = 12; offset <= 48; offset += 12) {
    ctx.beginPath();
    ctx.moveTo(netLeft.x, netLeft.y + offset);
    ctx.lineTo(netRight.x, netRight.y + offset);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.16;
  ctx.fillStyle = accent;
  ctx.fillRect(netLeft.x - 3, netLeft.y - 18, 6, 92);
  ctx.fillRect(netRight.x - 3, netRight.y - 18, 6, 92);
  ctx.restore();
}

async function drawClubIdentity(
  ctx: CanvasRenderingContext2D,
  data: GroupWinnerShareData,
  accent: string,
  cream: string,
  muted: string
): Promise<void> {
  const x = STORY_LAYOUT.padX;
  const top = STORY_LAYOUT.safeTop;
  const logoBox = 92;
  const clubName = data.clubName?.trim() || "Riviera Open";
  let image: HTMLImageElement | null = null;
  if (data.clubLogoUrl?.trim()) {
    try {
      image = await loadImage(data.clubLogoUrl.trim());
    } catch {
      image = null;
    }
  }

  if (image) {
    const imageWidth = image.naturalWidth || image.width;
    const imageHeight = image.naturalHeight || image.height;
    const scale = Math.min(logoBox / imageWidth, logoBox / imageHeight);
    const targetWidth = imageWidth * scale;
    const targetHeight = imageHeight * scale;
    ctx.drawImage(
      image,
      x + (logoBox - targetWidth) / 2,
      top + (logoBox - targetHeight) / 2,
      targetWidth,
      targetHeight
    );
  } else {
    const initials = initialsFromName(clubName);
    roundedRectPath(ctx, x, top, logoBox, logoBox, 18);
    ctx.fillStyle = "rgba(247,243,237,0.035)";
    ctx.fill();
    ctx.strokeStyle = "rgba(247,243,237,0.16)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.font = font(800, 31, "body");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials, x + logoBox / 2, top + logoBox / 2 + 2);
  }

  const textX = x + logoBox + 24;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = cream;
  ctx.font = font(790, 39, "body");
  ctx.fillText(
    ellipsizeText(
      ctx,
      clubName.toUpperCase(),
      GROUP_WINNER_SHARE_WIDTH - textX - x
    ),
    textX,
    top + 38
  );
  ctx.fillStyle = muted;
  ctx.font = font(720, 21, "body");
  drawTrackedText(
    ctx,
    "BY RIVIERA OPEN",
    textX,
    top + 74,
    2.5
  );
  ctx.fillStyle = "rgba(247,243,237,0.14)";
  ctx.fillRect(x, top + 112, GROUP_WINNER_SHARE_WIDTH - x * 2, 2);
  ctx.fillStyle = accent;
  ctx.fillRect(x, top + 112, 118, 3);
}

function drawSocialIcon(
  ctx: CanvasRenderingContext2D,
  platform: "instagram" | "tiktok" | "facebook",
  centerX: number,
  centerY: number,
  color: string
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  if (platform === "instagram") {
    roundedRectPath(ctx, centerX - 15, centerY - 15, 30, 30, 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(centerX, centerY, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(centerX + 9, centerY - 9, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (platform === "tiktok") {
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(centerX + 2, centerY - 15);
    ctx.lineTo(centerX + 2, centerY + 7);
    ctx.arc(centerX - 6, centerY + 7, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(centerX + 2, centerY - 14);
    ctx.lineTo(centerX + 13, centerY - 7);
    ctx.stroke();
  } else {
    ctx.font = font(850, 34, "body");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("f", centerX, centerY + 2);
  }
  ctx.restore();
}

function drawSocialSignature(
  ctx: CanvasRenderingContext2D,
  cream: string,
  muted: string,
  accent: string
): void {
  const x = STORY_LAYOUT.padX;
  const width = GROUP_WINNER_SHARE_WIDTH - x * 2;
  roundedRectPath(ctx, x, STORY_LAYOUT.footer.socialTop, width, 104, 24);
  ctx.fillStyle = "rgba(247,243,237,0.025)";
  ctx.fill();
  ctx.strokeStyle = "rgba(247,243,237,0.12)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = accent;
  ctx.fillRect(x + 1, STORY_LAYOUT.footer.socialTop + 1, 6, 102);
  const iconY = STORY_LAYOUT.footer.socialY - 7;
  drawSocialIcon(ctx, "instagram", x + 62, iconY, muted);
  drawSocialIcon(ctx, "tiktok", x + 122, iconY, muted);
  drawSocialIcon(ctx, "facebook", x + 182, iconY, muted);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = muted;
  ctx.font = font(700, 18, "body");
  drawTrackedText(ctx, "SÍGUENOS", x + 230, STORY_LAYOUT.footer.socialY - 18, 2.4);
  ctx.fillStyle = cream;
  ctx.font = font(760, 28, "body");
  ctx.fillText(RIVIERA_SOCIAL_HANDLE, x + 230, STORY_LAYOUT.footer.socialY + 22);

  ctx.textAlign = "right";
  ctx.fillStyle = muted;
  ctx.font = font(680, 18, "body");
  drawTrackedText(
    ctx,
    "RIVIERA OPEN",
    GROUP_WINNER_SHARE_WIDTH - x - trackedTextWidth(ctx, "RIVIERA OPEN", 2.2),
    STORY_LAYOUT.footer.socialY + 4,
    2.2
  );
  ctx.fillStyle = cream;
  ctx.textAlign = "left";
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("png_encode_failed"));
    }, "image/png");
  });
}

/**
 * Renderiza una Story PNG fija de 1080×1920. Usa únicamente los datos
 * existentes de la clasificación pública y no toma capturas del DOM.
 */
export async function renderGroupWinnerShareCanvas(
  data: GroupWinnerShareData
): Promise<HTMLCanvasElement> {
  if (typeof document === "undefined") throw new Error("canvas_unavailable");
  await document.fonts?.ready;

  const canvas = document.createElement("canvas");
  canvas.width = GROUP_WINNER_SHARE_WIDTH;
  canvas.height = GROUP_WINNER_SHARE_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const w = canvas.width;
  const h = canvas.height;
  const accent = resolveEditorialAccent(data.themeAccent);
  const primary = data.themePrimary?.trim() || "#111416";
  const cream = "#f7f3ed";
  const muted = "#c8c0b7";
  const quiet = "rgba(247,243,237,0.46)";
  const pad = STORY_LAYOUT.padX;

  // BACKGROUND — seis capas contenidas: base, diagonales, luz, cancha,
  // watermark y viñeta. Profundidad editorial sin ruido visual.
  ctx.fillStyle = "#090a0c";
  ctx.fillRect(0, 0, w, h);

  const background = ctx.createLinearGradient(0, 0, w, h);
  background.addColorStop(0, primary);
  background.addColorStop(0.36, "#111216");
  background.addColorStop(0.7, "#151313");
  background.addColorStop(1, "#08090b");
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  const terracottaLight = ctx.createRadialGradient(
    704,
    824,
    10,
    704,
    824,
    690
  );
  terracottaLight.addColorStop(0, accent);
  terracottaLight.addColorStop(0.42, "rgba(0,0,0,0)");
  terracottaLight.addColorStop(1, "rgba(0,0,0,0)");
  ctx.save();
  ctx.globalAlpha = 0.105;
  ctx.fillStyle = terracottaLight;
  ctx.fillRect(0, 260, w, 1320);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.09;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-160, 718);
  ctx.lineTo(954, 116);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(34, 1700);
  ctx.lineTo(1210, 1116);
  ctx.stroke();
  ctx.globalAlpha = 0.035;
  ctx.lineWidth = 28;
  ctx.beginPath();
  ctx.moveTo(720, -120);
  ctx.lineTo(1080, 420);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.032;
  ctx.fillStyle = cream;
  ctx.font = font(860, 210);
  ctx.textAlign = "left";
  ctx.fillText("RIVIERA", -34, 1148);
  ctx.restore();
  drawPremiumPadelCourtBackground(ctx, w, accent);

  const vignette = ctx.createLinearGradient(0, 0, 0, h);
  vignette.addColorStop(0, "rgba(0,0,0,0.12)");
  vignette.addColorStop(0.18, "rgba(0,0,0,0)");
  vignette.addColorStop(0.76, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.48)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  // HEADER — el club anfitrión abre la pieza; Riviera queda como plataforma.
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  await drawClubIdentity(ctx, data, accent, cream, muted);

  const eventLines = textLinesToFit(
    ctx,
    data.tournamentName.toUpperCase(),
    760,
    1,
    42,
    30,
    800
  );
  ctx.fillStyle = cream;
  drawTextLines(
    ctx,
    eventLines,
    pad,
    STORY_LAYOUT.header.tournamentY,
    1.08,
    800
  );
  ctx.fillStyle = muted;
  ctx.font = font(700, 24, "body");
  const context = `${data.categoryName.toUpperCase()}  ·  ${data.groupName.toUpperCase()}`;
  ctx.fillText(
    ellipsizeText(ctx, context, w - pad * 2),
    pad,
    STORY_LAYOUT.header.contextY
  );

  // ACHIEVEMENT — índice, regla editorial y logro construyen un solo gesto.
  ctx.save();
  ctx.strokeStyle = "rgba(247,243,237,0.13)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, 376);
  ctx.lineTo(w - pad, 376);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = accent;
  ctx.font = font(820, 36);
  ctx.fillText(
    String(data.position).padStart(2, "0"),
    pad,
    STORY_LAYOUT.achievement.detailY
  );
  ctx.fillRect(pad + 66, STORY_LAYOUT.achievement.detailY - 12, 206, 3);
  ctx.fillStyle = cream;
  ctx.font = font(760, 23, "body");
  drawTrackedText(
    ctx,
    placementLabel(data.position),
    pad + 300,
    STORY_LAYOUT.achievement.detailY,
    2.8
  );
  ctx.fillStyle = accent;
  ctx.fillRect(w - pad - 74, STORY_LAYOUT.achievement.detailY - 22, 74, 3);
  ctx.fillRect(w - pad - 42, STORY_LAYOUT.achievement.detailY - 8, 42, 3);
  ctx.fillRect(w - pad - 20, STORY_LAYOUT.achievement.detailY + 6, 20, 3);

  ctx.fillStyle = cream;
  const titleLines = textLinesToFit(
    ctx,
    "¡FELICIDADES!",
    w - pad * 2,
    1,
    98,
    82,
    850
  );
  drawTextLines(
    ctx,
    titleLines,
    pad,
    STORY_LAYOUT.achievement.titleY,
    1,
    850
  );
  ctx.fillStyle = muted;
  ctx.font = font(560, 30, "body");
  ctx.fillText(
    "Lo dieron todo de principio a fin.",
    pad + 4,
    STORY_LAYOUT.achievement.copyY
  );

  // PLAYERS — retratos protagonistas con eje central y profundidad de póster.
  ctx.save();
  ctx.strokeStyle = "rgba(247,243,237,0.1)";
  ctx.lineWidth = 2;
  roundedRectPath(ctx, pad - 12, 676, w - pad * 2 + 24, 476, 34);
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.24;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w / 2, 704);
  ctx.lineTo(w / 2, 1126);
  ctx.stroke();
  ctx.globalAlpha = 0.12;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(
    STORY_LAYOUT.players.firstX - 20,
    STORY_LAYOUT.players.firstY + 12,
    186,
    0,
    Math.PI * 2
  );
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(
    STORY_LAYOUT.players.secondX + 18,
    STORY_LAYOUT.players.secondY - 10,
    186,
    0,
    Math.PI * 2
  );
  ctx.stroke();
  ctx.restore();

  await drawAvatar(
    ctx,
    data.player1,
    STORY_LAYOUT.players.firstX,
    STORY_LAYOUT.players.firstY,
    STORY_LAYOUT.players.diameter,
    accent
  );
  await drawAvatar(
    ctx,
    data.player2,
    STORY_LAYOUT.players.secondX,
    STORY_LAYOUT.players.secondY,
    STORY_LAYOUT.players.diameter,
    accent
  );

  ctx.textAlign = "center";
  ctx.fillStyle = cream;
  for (const [player, x, y] of [
    [
      data.player1,
      STORY_LAYOUT.players.firstX,
      STORY_LAYOUT.players.firstNameY,
    ],
    [
      data.player2,
      STORY_LAYOUT.players.secondX,
      STORY_LAYOUT.players.secondNameY,
    ],
  ] as const) {
    const lines = textLinesToFit(
      ctx,
      player.name,
      STORY_LAYOUT.players.nameWidth,
      2,
      44,
      30,
      750
    );
    drawTextLines(ctx, lines, x, y, 1.12, 750);
  }

  // STATS — scoreboard continuo: una superficie, tres lecturas, un solo ritmo.
  ctx.textAlign = "center";
  roundedRectPath(
    ctx,
    pad,
    STORY_LAYOUT.stats.top,
    w - pad * 2,
    STORY_LAYOUT.stats.bottom - STORY_LAYOUT.stats.top,
    26
  );
  const scoreboard = ctx.createLinearGradient(
    pad,
    STORY_LAYOUT.stats.top,
    w - pad,
    STORY_LAYOUT.stats.bottom
  );
  scoreboard.addColorStop(0, "rgba(247,243,237,0.055)");
  scoreboard.addColorStop(0.5, "rgba(247,243,237,0.025)");
  scoreboard.addColorStop(1, "rgba(247,243,237,0.045)");
  ctx.fillStyle = scoreboard;
  ctx.fill();
  ctx.strokeStyle = "rgba(247,243,237,0.16)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.fillRect(pad + 26, STORY_LAYOUT.stats.top, 126, 4);

  const statW = (w - pad * 2) / 3;
  const stats = [
    { value: String(data.points), label: "PTS" },
    { value: String(data.wins), label: "PG" },
    { value: formatSignedNumber(data.diff), label: "DIF" },
  ];
  stats.forEach((stat, index) => {
    const x = pad + statW * index;
    if (index > 0) {
      const divider = ctx.createLinearGradient(
        x,
        STORY_LAYOUT.stats.top + 30,
        x,
        STORY_LAYOUT.stats.bottom - 30
      );
      divider.addColorStop(0, "rgba(247,243,237,0)");
      divider.addColorStop(0.5, "rgba(247,243,237,0.22)");
      divider.addColorStop(1, "rgba(247,243,237,0)");
      ctx.strokeStyle = divider;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, STORY_LAYOUT.stats.top + 28);
      ctx.lineTo(x, STORY_LAYOUT.stats.bottom - 28);
      ctx.stroke();
    }
    ctx.fillStyle = index === 2 && data.diff > 0 ? accent : cream;
    ctx.font = font(830, 76);
    ctx.fillText(stat.value, x + statW / 2, STORY_LAYOUT.stats.valueY);
    ctx.fillStyle = quiet;
    ctx.font = font(760, 21, "body");
    drawTrackedText(
      ctx,
      stat.label,
      x +
        statW / 2 -
        trackedTextWidth(ctx, stat.label, 2.6) / 2,
      STORY_LAYOUT.stats.labelY,
      3
    );
    ctx.fillStyle = index === 2 && data.diff > 0 ? accent : "rgba(247,243,237,0.22)";
    ctx.fillRect(x + statW / 2 - 28, STORY_LAYOUT.stats.labelY + 18, 56, 2);
  });

  // FOOTER — cierre emocional primero; firma social integrada después.
  ctx.fillStyle = accent;
  ctx.fillRect(w / 2 - 24, STORY_LAYOUT.footer.taglineTop, 48, 3);
  ctx.textAlign = "center";
  ctx.fillStyle = cream;
  ctx.font = font(760, 38, "heading");
  ctx.fillText(WINNER_TAGLINE, w / 2, STORY_LAYOUT.footer.taglineY);
  ctx.fillStyle = "rgba(247,243,237,0.16)";
  ctx.fillRect(w / 2 - 132, STORY_LAYOUT.footer.taglineY + 36, 264, 2);
  ctx.textAlign = "left";
  drawSocialSignature(ctx, cream, muted, accent);

  return canvas;
}

export async function renderGroupWinnerSharePng(
  data: GroupWinnerShareData
): Promise<Blob> {
  return canvasToBlob(await renderGroupWinnerShareCanvas(data));
}
