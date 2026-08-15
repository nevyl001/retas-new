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
  safeTop: 136,
  safeBottom: 172,
  padX: 88,
  header: {
    tournamentY: 294,
    contextGap: 42,
  },
  achievement: {
    detailY: 424,
    titleY: 548,
    copyY: 620,
  },
  players: {
    firstX: 336,
    secondX: 744,
    firstY: 914,
    secondY: 950,
    diameter: 276,
    firstNameY: 1090,
    secondNameY: 1126,
    nameWidth: 344,
  },
  stats: {
    top: 1242,
    valueY: 1352,
    labelY: 1400,
    bottom: 1450,
  },
  footer: {
    ruleY: 1518,
    taglineY: 1578,
    socialY: 1692,
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

async function drawAvatar(
  ctx: CanvasRenderingContext2D,
  player: GroupWinnerSharePlayer,
  centerX: number,
  centerY: number,
  diameter: number,
  accent: string
) {
  const radius = diameter / 2;
  const portraitRadius = radius - 12;

  ctx.save();
  ctx.fillStyle = "#101114";
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius + 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#08090b";
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius - 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius - 7, 0, Math.PI * 2);
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
      centerX - portraitRadius * 0.28,
      centerY - portraitRadius * 0.34,
      portraitRadius * 0.08,
      centerX,
      centerY,
      portraitRadius
    );
    gradient.addColorStop(0, "#3b3d42");
    gradient.addColorStop(0.5, "#24262b");
    gradient.addColorStop(1, "#111216");
    ctx.fillStyle = gradient;
    ctx.fillRect(
      centerX - portraitRadius,
      centerY - portraitRadius,
      portraitRadius * 2,
      portraitRadius * 2
    );
    ctx.fillStyle = "#f7f3ed";
    ctx.font = font(800, 78);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initialsFromName(player.name), centerX, centerY + 5);
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(247,243,237,0.15)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(centerX, centerY, portraitRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Textura editorial de cancha: perspectiva y red, deliberadamente sutil. */
function drawMinimalPadelCourt(
  ctx: CanvasRenderingContext2D,
  width: number,
  accent: string
): void {
  const leftTop = { x: 124, y: 760 };
  const rightTop = { x: width - 124, y: 704 };
  const rightBottom = { x: width - 78, y: 1562 };
  const leftBottom = { x: 78, y: 1620 };
  const midpoint = (a: typeof leftTop, b: typeof rightTop, ratio: number) => ({
    x: a.x + (b.x - a.x) * ratio,
    y: a.y + (b.y - a.y) * ratio,
  });

  const topQuarterLeft = midpoint(leftTop, leftBottom, 0.29);
  const topQuarterRight = midpoint(rightTop, rightBottom, 0.29);
  const netLeft = midpoint(leftTop, leftBottom, 0.51);
  const netRight = midpoint(rightTop, rightBottom, 0.51);
  const bottomQuarterLeft = midpoint(leftTop, leftBottom, 0.74);
  const bottomQuarterRight = midpoint(rightTop, rightBottom, 0.74);

  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = "#f7f3ed";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(leftTop.x, leftTop.y);
  ctx.lineTo(rightTop.x, rightTop.y);
  ctx.lineTo(rightBottom.x, rightBottom.y);
  ctx.lineTo(leftBottom.x, leftBottom.y);
  ctx.closePath();
  ctx.stroke();
  [topQuarterLeft, netLeft, bottomQuarterLeft].forEach((left, index) => {
    const right = [topQuarterRight, netRight, bottomQuarterRight][index];
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

  ctx.globalAlpha = 0.085;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(netLeft.x, netLeft.y);
  ctx.lineTo(netRight.x, netRight.y);
  ctx.stroke();
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
  const logoBox = 96;
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
  }

  const textX = x + (image ? logoBox + 22 : 0);
  ctx.textAlign = "left";
  ctx.fillStyle = cream;
  ctx.font = font(780, 42, "body");
  ctx.fillText(
    ellipsizeText(
      ctx,
      clubName.toUpperCase(),
      GROUP_WINNER_SHARE_WIDTH - textX - x
    ),
    textX,
    top + 39
  );
  ctx.fillStyle = muted;
  ctx.font = font(700, 24, "body");
  drawTrackedText(
    ctx,
    "BY RIVIERA OPEN",
    textX,
    top + 77,
    2.3
  );
  ctx.fillStyle = accent;
  ctx.fillRect(x, top + 112, 92, 3);
}

function drawSocialSignature(
  ctx: CanvasRenderingContext2D,
  cream: string,
  muted: string
): void {
  const x = STORY_LAYOUT.padX;
  ctx.fillStyle = muted;
  ctx.font = font(650, 25, "body");
  drawTrackedText(
    ctx,
    "IG   TIKTOK   FACEBOOK",
    x,
    STORY_LAYOUT.footer.socialY,
    1.1
  );
  ctx.textAlign = "right";
  ctx.fillStyle = cream;
  ctx.font = font(700, 27, "body");
  ctx.fillText(RIVIERA_SOCIAL_HANDLE, 992, STORY_LAYOUT.footer.socialY);
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

  // BACKGROUND — graphite editorial con identidad ambiental muy contenida.
  ctx.fillStyle = "#0e0e10";
  ctx.fillRect(0, 0, w, h);

  const background = ctx.createLinearGradient(0, 0, w, h);
  background.addColorStop(0, primary);
  background.addColorStop(0.46, "#111216");
  background.addColorStop(1, "#171310");
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  const playerLight = ctx.createRadialGradient(
    w / 2,
    980,
    20,
    w / 2,
    980,
    610
  );
  playerLight.addColorStop(0, accent);
  playerLight.addColorStop(1, "rgba(0,0,0,0)");
  ctx.save();
  ctx.globalAlpha = 0.075;
  ctx.fillStyle = playerLight;
  ctx.fillRect(0, 430, w, 1050);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.055;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-180, 710);
  ctx.lineTo(940, 140);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(140, 1720);
  ctx.lineTo(1160, 1170);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.022;
  ctx.fillStyle = cream;
  ctx.font = font(850, 190);
  ctx.textAlign = "left";
  ctx.fillText("RIVIERA", -44, 1075);
  ctx.restore();
  drawMinimalPadelCourt(ctx, w, accent);

  // HEADER — el club anfitrión abre la pieza; Riviera queda como plataforma.
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  await drawClubIdentity(ctx, data, accent, cream, muted);

  const eventLines = textLinesToFit(
    ctx,
    data.tournamentName.toUpperCase(),
    690,
    2,
    46,
    32,
    800
  );
  ctx.fillStyle = cream;
  const eventBottom = drawTextLines(
    ctx,
    eventLines,
    pad,
    STORY_LAYOUT.header.tournamentY,
    1.08,
    800
  );
  ctx.fillStyle = muted;
  ctx.font = font(700, 27, "body");
  const context = `${data.categoryName.toUpperCase()}  ·  ${data.groupName.toUpperCase()}`;
  ctx.fillText(
    ellipsizeText(ctx, context, w - pad * 2),
    pad,
    eventBottom + STORY_LAYOUT.header.contextGap
  );

  // ACHIEVEMENT — microdetalle de posición + mensaje principal.
  ctx.fillStyle = accent;
  ctx.font = font(800, 34);
  ctx.fillText(
    String(data.position).padStart(2, "0"),
    pad,
    STORY_LAYOUT.achievement.detailY
  );
  ctx.fillRect(pad + 60, STORY_LAYOUT.achievement.detailY - 12, 126, 3);
  ctx.font = font(750, 25, "body");
  drawTrackedText(
    ctx,
    placementLabel(data.position),
    pad + 214,
    STORY_LAYOUT.achievement.detailY,
    2.4
  );

  ctx.fillStyle = cream;
  const titleLines = textLinesToFit(
    ctx,
    "¡FELICIDADES!",
    w - pad * 2,
    1,
    94,
    78,
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
  ctx.font = font(550, 32, "body");
  ctx.fillText(
    "Lo dieron todo de principio a fin.",
    pad + 4,
    STORY_LAYOUT.achievement.copyY
  );

  // PLAYERS — retratos dominantes, levemente asimétricos y con igual peso.
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.24;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(112, 1008);
  ctx.lineTo(968, 1008);
  ctx.stroke();
  ctx.restore();

  await Promise.all([
    drawAvatar(
      ctx,
      data.player1,
      STORY_LAYOUT.players.firstX,
      STORY_LAYOUT.players.firstY,
      STORY_LAYOUT.players.diameter,
      accent
    ),
    drawAvatar(
      ctx,
      data.player2,
      STORY_LAYOUT.players.secondX,
      STORY_LAYOUT.players.secondY,
      STORY_LAYOUT.players.diameter,
      accent
    ),
  ]);

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

  // STATS — una sola unidad visual, sin cards ni información redundante.
  ctx.textAlign = "center";
  ctx.strokeStyle = "rgba(247,243,237,0.16)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, STORY_LAYOUT.stats.top);
  ctx.lineTo(w - pad, STORY_LAYOUT.stats.top);
  ctx.stroke();

  const statW = (w - pad * 2) / 3;
  const stats = [
    { value: String(data.points), label: "PTS" },
    { value: String(data.wins), label: "PG" },
    { value: formatSignedNumber(data.diff), label: "DIF" },
  ];
  stats.forEach((stat, index) => {
    const x = pad + statW * index;
    if (index > 0) {
      ctx.strokeStyle = "rgba(247,243,237,0.16)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, STORY_LAYOUT.stats.top + 40);
      ctx.lineTo(x, STORY_LAYOUT.stats.bottom - 12);
      ctx.stroke();
    }
    ctx.fillStyle = index === 2 && data.diff > 0 ? accent : cream;
    ctx.font = font(800, 72);
    ctx.fillText(stat.value, x + statW / 2, STORY_LAYOUT.stats.valueY);
    ctx.fillStyle = quiet;
    ctx.font = font(750, 24, "body");
    drawTrackedText(
      ctx,
      stat.label,
      x +
        statW / 2 -
        trackedTextWidth(ctx, stat.label, 2.6) / 2,
      STORY_LAYOUT.stats.labelY,
      2.6
    );
  });

  // FOOTER — tagline y redes como firma secundaria.
  ctx.strokeStyle = "rgba(247,243,237,0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, STORY_LAYOUT.footer.ruleY);
  ctx.lineTo(w - pad, STORY_LAYOUT.footer.ruleY);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = cream;
  ctx.font = font(750, 36, "heading");
  ctx.fillText(WINNER_TAGLINE, w / 2, STORY_LAYOUT.footer.taglineY);
  ctx.textAlign = "left";
  drawSocialSignature(ctx, cream, muted);

  return canvas;
}

export async function renderGroupWinnerSharePng(
  data: GroupWinnerShareData
): Promise<Blob> {
  return canvasToBlob(await renderGroupWinnerShareCanvas(data));
}
