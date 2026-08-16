import {
  formatPodiumShareDif,
  PODIUM_SHARE_HEIGHT,
  PODIUM_SHARE_WIDTH,
  type PodiumSharePresentation,
} from "./publicPodiumSharePresentation";
import {
  computeCoverCrop,
  initialsFromName,
} from "./renderGroupWinnerShareCanvas";

export const TOURNAMENT_PODIUM_SHARE_WIDTH = PODIUM_SHARE_WIDTH;
export const TOURNAMENT_PODIUM_SHARE_HEIGHT = PODIUM_SHARE_HEIGHT;

const TONE = {
  first: "#b89654",
  second: "#b6bdc7",
  third: "#a77d5e",
} as const;

const COLOR = {
  background: "#070a0e",
  surface: "#10151c",
  surfaceRaised: "#161c24",
  text: "#f4f1ea",
  textSoft: "#c4c8cf",
  textMuted: "#8b93a0",
  line: "rgba(244,241,234,0.12)",
  lineSoft: "rgba(244,241,234,0.06)",
} as const;

type FontRole = "heading" | "body";

function fontFamily(role: FontRole): string {
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
  role: FontRole = "heading",
): string {
  return `${weight} ${size}px ${fontFamily(role)}`;
}

function centered(ctx: CanvasRenderingContext2D, text: string, y: number) {
  ctx.textAlign = "center";
  ctx.fillText(text, PODIUM_SHARE_WIDTH / 2, y);
}

function centeredAt(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
) {
  ctx.textAlign = "center";
  ctx.fillText(text, x, y);
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
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

function fitSingleLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxSize: number,
  minSize: number,
  weight = 750,
): number {
  for (let size = maxSize; size >= minSize; size -= 1) {
    ctx.font = font(weight, size);
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  return minSize;
}

function ellipsize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let value = text.trim();
  while (value.length > 1 && ctx.measureText(`${value}…`).width > maxWidth) {
    value = value.slice(0, -1).trimEnd();
  }
  return `${value}…`;
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let line = words[0];

  for (let index = 1; index < words.length; index += 1) {
    const candidate = `${line} ${words[index]}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = words[index];
    if (lines.length === maxLines - 1) {
      line = [line, ...words.slice(index + 1)].join(" ");
      break;
    }
  }
  lines.push(line);
  return lines.slice(0, maxLines);
}

function drawWrapped(
  ctx: CanvasRenderingContext2D,
  text: string,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  wrap(ctx, text, maxWidth, maxLines).forEach((line, index) =>
    centered(ctx, line, y + index * lineHeight),
  );
}

function drawBackground(ctx: CanvasRenderingContext2D, tone: string) {
  const w = PODIUM_SHARE_WIDTH;
  const h = PODIUM_SHARE_HEIGHT;

  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, COLOR.surface);
  base.addColorStop(0.52, COLOR.background);
  base.addColorStop(1, "#040609");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  const heroGlow = ctx.createRadialGradient(540, 690, 20, 540, 690, 620);
  heroGlow.addColorStop(0, `${tone}2b`);
  heroGlow.addColorStop(0.44, `${tone}0f`);
  heroGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = heroGlow;
  ctx.fillRect(0, 0, w, 1430);

  const topLight = ctx.createRadialGradient(540, 0, 0, 540, 0, 700);
  topLight.addColorStop(0, "rgba(244,241,234,0.07)");
  topLight.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = topLight;
  ctx.fillRect(0, 0, w, 760);

  drawEditorialCourt(ctx);
  drawGrain(ctx);

  const vignette = ctx.createRadialGradient(540, 900, 380, 540, 900, 1050);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.58)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
}

function drawEditorialCourt(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.strokeStyle = COLOR.lineSoft;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(168, 1920);
  ctx.lineTo(422, 390);
  ctx.moveTo(912, 1920);
  ctx.lineTo(658, 390);
  ctx.moveTo(540, 390);
  ctx.lineTo(540, 1920);
  ctx.moveTo(85, 1005);
  ctx.lineTo(995, 1005);
  ctx.moveTo(0, 1395);
  ctx.lineTo(1080, 1395);
  ctx.stroke();

  ctx.strokeStyle = "rgba(244,241,234,0.035)";
  ctx.lineWidth = 1;
  ctx.strokeRect(122, 370, 836, 1390);
  ctx.restore();
}

function drawGrain(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.fillStyle = "rgba(244,241,234,0.022)";
  for (let index = 0; index < 420; index += 1) {
    const x = (index * 83 + 37) % PODIUM_SHARE_WIDTH;
    const y = (index * 137 + 61) % PODIUM_SHARE_HEIGHT;
    const size = index % 7 === 0 ? 2 : 1;
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image_load_failed"));
    image.src = url;
  });
}

async function drawClubIdentity(
  ctx: CanvasRenderingContext2D,
  data: PodiumSharePresentation,
  tone: string,
) {
  const markX = 118;
  const markY = 118;
  const markSize = 76;
  let drewLogo = false;

  if (data.clubLogoUrl) {
    try {
      const logo = await loadImage(data.clubLogoUrl);
      const scale = Math.min(markSize / logo.width, markSize / logo.height);
      const width = logo.width * scale;
      const height = logo.height * scale;
      ctx.drawImage(
        logo,
        markX + (markSize - width) / 2,
        markY + (markSize - height) / 2,
        width,
        height,
      );
      drewLogo = true;
    } catch {
      drewLogo = false;
    }
  }

  if (!drewLogo) {
    const cx = markX + markSize / 2;
    const cy = markY + markSize / 2;
    ctx.fillStyle = COLOR.surfaceRaised;
    ctx.beginPath();
    ctx.arc(cx, cy, markSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `${tone}78`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = COLOR.text;
    ctx.font = font(800, 28);
    centeredAt(ctx, data.clubName.trim().slice(0, 1).toUpperCase(), cx, cy + 10);
  }

  ctx.textAlign = "left";
  ctx.fillStyle = COLOR.text;
  const clubName = data.clubName.toUpperCase();
  const clubNameSize = fitSingleLine(ctx, clubName, 700, 29, 21, 800);
  ctx.font = font(800, clubNameSize);
  ctx.fillText(ellipsize(ctx, clubName, 700), 220, 151);

  if (data.showMotherAttribution) {
    ctx.strokeStyle = `${tone}99`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(220, 179);
    ctx.lineTo(254, 179);
    ctx.stroke();
    ctx.fillStyle = COLOR.textMuted;
    ctx.font = font(650, 18, "body");
    ctx.fillText("BY RIVIERA OPEN", 270, 185);
  }
}

async function drawAvatar(
  ctx: CanvasRenderingContext2D,
  player: PodiumSharePresentation["players"][number],
  x: number,
  y: number,
  tone: string,
) {
  const radius = 122;
  const halo = ctx.createRadialGradient(x, y, radius * 0.45, x, y, radius + 32);
  halo.addColorStop(0, `${tone}1f`);
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, radius + 32, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COLOR.surfaceRaised;
  ctx.beginPath();
  ctx.arc(x, y, radius + 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `${tone}66`;
  ctx.lineWidth = 2;
  ctx.stroke();

  let drewPhoto = false;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();
  if (player.fotoUrl) {
    try {
      const image = await loadImage(player.fotoUrl);
      const crop = computeCoverCrop(
        image.width,
        image.height,
        radius * 2,
        radius * 2,
      );
      ctx.drawImage(
        image,
        crop.sx,
        crop.sy,
        crop.sw,
        crop.sh,
        x - radius,
        y - radius,
        radius * 2,
        radius * 2,
      );
      drewPhoto = true;
    } catch {
      drewPhoto = false;
    }
  }

  if (!drewPhoto) {
    const fallback = ctx.createRadialGradient(
      x - radius * 0.35,
      y - radius * 0.4,
      0,
      x,
      y,
      radius * 1.3,
    );
    fallback.addColorStop(0, `${tone}35`);
    fallback.addColorStop(0.5, COLOR.surfaceRaised);
    fallback.addColorStop(1, COLOR.background);
    ctx.fillStyle = fallback;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  ctx.restore();

  ctx.strokeStyle = `${tone}c2`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();

  if (!drewPhoto) {
    ctx.fillStyle = COLOR.text;
    ctx.font = font(800, 52);
    centeredAt(ctx, initialsFromName(player.name), x, y + 18);
  }
}

function drawPlayerName(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
) {
  const size = fitSingleLine(ctx, name, 330, 34, 24, 800);
  ctx.font = font(800, size);
  ctx.fillStyle = COLOR.text;
  centeredAt(ctx, ellipsize(ctx, name, 330), x, y);
}

function drawStats(
  ctx: CanvasRenderingContext2D,
  data: PodiumSharePresentation,
  tone: string,
) {
  if (!data.stats) return;
  const x = 104;
  const y = 1192;
  const width = 872;
  const height = 190;

  const surface = ctx.createLinearGradient(0, y, 0, y + height);
  surface.addColorStop(0, "rgba(244,241,234,0.055)");
  surface.addColorStop(1, "rgba(244,241,234,0.018)");
  ctx.fillStyle = surface;
  roundedRect(ctx, x, y, width, height, 24);
  ctx.fill();
  ctx.strokeStyle = "rgba(244,241,234,0.11)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = font(750, 17);
  ctx.fillStyle = COLOR.textMuted;
  centered(ctx, "EN ESTE TORNEO", y + 44);

  const values = [
    ["PJ", String(data.stats.partidos)],
    ["PG", String(data.stats.victorias)],
    ["PP", String(data.stats.derrotas)],
    ["DIF", formatPodiumShareDif(data.stats.dif)],
  ];
  values.forEach(([label, value], index) => {
    const columnWidth = width / values.length;
    const centerX = x + columnWidth * index + columnWidth / 2;
    if (index > 0) {
      ctx.strokeStyle = COLOR.line;
      ctx.beginPath();
      ctx.moveTo(x + columnWidth * index, y + 70);
      ctx.lineTo(x + columnWidth * index, y + height - 24);
      ctx.stroke();
    }
    ctx.font = font(750, 16);
    ctx.fillStyle = COLOR.textMuted;
    centeredAt(ctx, label, centerX, y + 95);
    ctx.font = font(800, 43);
    ctx.fillStyle = label === "DIF" ? tone : COLOR.text;
    centeredAt(ctx, value, centerX, y + 151);
  });
}

function drawFooter(
  ctx: CanvasRenderingContext2D,
  data: PodiumSharePresentation,
  tone: string,
) {
  ctx.font = font(600, 25, "body");
  ctx.fillStyle = COLOR.textSoft;
  drawWrapped(ctx, data.motivation, 1485, 790, 35, 3);

  ctx.font = font(500, 22, "body");
  ctx.fillStyle = COLOR.textMuted;
  drawWrapped(
    ctx,
    "Gracias por participar en el torneo y ser parte de esta competencia.",
    1592,
    780,
    31,
    2,
  );

  ctx.font = font(800, 24);
  ctx.fillStyle = COLOR.text;
  drawWrapped(
    ctx,
    "Esto no termina aquí. Nos vemos en la próxima competencia.",
    1688,
    790,
    32,
    2,
  );

  ctx.strokeStyle = COLOR.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(104, 1770);
  ctx.lineTo(976, 1770);
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.fillStyle = COLOR.text;
  ctx.font = font(800, 18);
  ctx.fillText("RIVIERA OPEN", 104, 1822);
  ctx.fillStyle = tone;
  ctx.fillRect(104, 1838, 48, 2);

  ctx.textAlign = "right";
  ctx.fillStyle = COLOR.textMuted;
  ctx.font = font(650, 17, "body");
  ctx.fillText("@rivieraopen  ·  Instagram  TikTok  Facebook", 976, 1822);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("png_failed"))),
      "image/png",
    );
  });
}

export async function renderTournamentPodiumShareCanvas(
  data: PodiumSharePresentation,
): Promise<HTMLCanvasElement> {
  if (typeof document === "undefined") throw new Error("canvas_unavailable");
  const canvas = document.createElement("canvas");
  canvas.width = TOURNAMENT_PODIUM_SHARE_WIDTH;
  canvas.height = TOURNAMENT_PODIUM_SHARE_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");

  const tone = TONE[data.place];
  drawBackground(ctx, tone);

  ctx.strokeStyle = `${tone}72`;
  ctx.lineWidth = 2;
  ctx.strokeRect(64, 64, canvas.width - 128, canvas.height - 128);
  ctx.strokeStyle = "rgba(244,241,234,0.08)";
  ctx.lineWidth = 1;
  ctx.strokeRect(72, 72, canvas.width - 144, canvas.height - 144);

  await drawClubIdentity(ctx, data, tone);

  ctx.textAlign = "left";
  ctx.font = font(750, 21);
  ctx.fillStyle = COLOR.textMuted;
  ctx.fillText(data.tournamentName.toUpperCase(), 104, 292);
  if (data.category) {
    ctx.font = font(650, 18, "body");
    ctx.fillStyle = COLOR.textMuted;
    ctx.fillText(data.category.toUpperCase(), 104, 324);
  }

  ctx.font = font(800, 19);
  const pillWidth = Math.max(170, ctx.measureText(data.positionLabel).width + 54);
  roundedRect(ctx, 976 - pillWidth, 268, pillWidth, 52, 26);
  ctx.fillStyle = `${tone}12`;
  ctx.fill();
  ctx.strokeStyle = `${tone}5c`;
  ctx.stroke();
  ctx.fillStyle = tone;
  ctx.textAlign = "center";
  ctx.fillText(data.positionLabel, 976 - pillWidth / 2, 301);

  ctx.fillStyle = tone;
  ctx.font = font(800, 22);
  centered(ctx, data.title, 444);

  const [first, second] = data.players.slice(0, 2);
  if (first) await drawAvatar(ctx, first, 320, 674, tone);
  if (second) await drawAvatar(ctx, second, 760, 674, tone);

  ctx.strokeStyle = COLOR.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(540, 542);
  ctx.lineTo(540, 806);
  ctx.stroke();
  ctx.fillStyle = tone;
  ctx.beginPath();
  ctx.arc(540, 674, 5, 0, Math.PI * 2);
  ctx.fill();

  if (first) drawPlayerName(ctx, first.name, 320, 838);
  if (second) drawPlayerName(ctx, second.name, 760, 838);

  ctx.font = font(800, 55);
  ctx.fillStyle = COLOR.text;
  drawWrapped(ctx, data.headline, 960, 830, 62, 2);
  ctx.font = font(500, 25, "body");
  ctx.fillStyle = COLOR.textSoft;
  drawWrapped(ctx, data.recognition, 1085, 770, 36, 3);

  drawStats(ctx, data, tone);
  drawFooter(ctx, data, tone);
  return canvas;
}

export async function renderTournamentPodiumSharePng(
  data: PodiumSharePresentation,
) {
  return canvasToBlob(await renderTournamentPodiumShareCanvas(data));
}

export function podiumShareFileName(data: PodiumSharePresentation): string {
  const slug = `${data.tournamentName}-${data.positionLabel}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `riviera-open-${slug || "podio"}.png`;
}
