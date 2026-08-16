import {
  formatPodiumShareDif,
  PODIUM_SHARE_HEIGHT,
  PODIUM_SHARE_WIDTH,
  type PodiumSharePresentation,
} from "./publicPodiumSharePresentation";
import { initialsFromName } from "./renderGroupWinnerShareCanvas";

export const TOURNAMENT_PODIUM_SHARE_WIDTH = PODIUM_SHARE_WIDTH;
export const TOURNAMENT_PODIUM_SHARE_HEIGHT = PODIUM_SHARE_HEIGHT;

const TONE = {
  first: "#b5883f",
  second: "#aeb5be",
  third: "#9a7657",
} as const;

function font(weight: number, size: number): string {
  return `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
}

function centered(ctx: CanvasRenderingContext2D, text: string, y: number) {
  ctx.textAlign = "center";
  ctx.fillText(text, PODIUM_SHARE_WIDTH / 2, y);
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines - 1) break;
  }
  if (line) lines.push(line);
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

function drawCourt(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.055)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(90, 430);
  ctx.lineTo(990, 430);
  ctx.moveTo(0, 950);
  ctx.lineTo(1080, 950);
  ctx.moveTo(180, 1920);
  ctx.lineTo(900, 1920);
  ctx.moveTo(540, 430);
  ctx.lineTo(540, 1920);
  ctx.stroke();
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

async function drawAvatar(
  ctx: CanvasRenderingContext2D,
  player: PodiumSharePresentation["players"][number],
  x: number,
  y: number,
  tone: string,
) {
  const radius = 94;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();
  if (player.fotoUrl) {
    try {
      const image = await loadImage(player.fotoUrl);
      const scale = Math.max(
        (radius * 2) / image.width,
        (radius * 2) / image.height,
      );
      const width = image.width * scale;
      const height = image.height * scale;
      ctx.drawImage(image, x - width / 2, y - height / 2, width, height);
    } catch {
      ctx.fillStyle = "#1a2028";
      ctx.fill();
    }
  } else {
    ctx.fillStyle = "#1a2028";
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = tone;
  ctx.globalAlpha = 0.72;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  if (!player.fotoUrl) {
    ctx.fillStyle = "#f5f2eb";
    ctx.font = font(750, 44);
    centeredAt(ctx, initialsFromName(player.name), x, y + 15);
  }
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
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = "#080b0f";
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w / 2, 720, 0, w / 2, 720, 620);
  glow.addColorStop(0, `${tone}22`);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  drawCourt(ctx);

  ctx.strokeStyle = `${tone}88`;
  ctx.lineWidth = 2;
  ctx.strokeRect(64, 64, w - 128, h - 128);
  ctx.fillStyle = "#f5f2eb";
  ctx.font = font(750, 27);
  ctx.textAlign = "left";
  ctx.fillText(data.clubName.toUpperCase(), 118, 148);
  ctx.fillStyle = "#8b93a0";
  ctx.font = font(650, 18);
  ctx.fillText(
    data.showMotherAttribution ? "BY RIVIERA OPEN" : "RIVIERA OPEN",
    118,
    182,
  );

  ctx.font = font(700, 22);
  ctx.fillStyle = "#8b93a0";
  ctx.textAlign = "left";
  ctx.fillText(data.tournamentName.toUpperCase(), 118, 268);
  if (data.category) ctx.fillText(data.category.toUpperCase(), 118, 300);
  ctx.textAlign = "right";
  ctx.fillStyle = tone;
  ctx.fillText(data.positionLabel, 962, 268);

  ctx.textAlign = "center";
  ctx.fillStyle = tone;
  ctx.font = font(800, 27);
  centered(ctx, data.title, 415);
  const [first, second] = data.players.slice(0, 2);
  if (first) await drawAvatar(ctx, first, 330, 622, tone);
  if (second) await drawAvatar(ctx, second, 750, 622, tone);
  ctx.fillStyle = "#f5f2eb";
  ctx.font = font(750, 30);
  if (first) centeredAt(ctx, first.name, 330, 760);
  if (second) centeredAt(ctx, second.name, 750, 760);

  ctx.font = font(800, 50);
  ctx.fillStyle = "#f5f2eb";
  drawWrapped(ctx, data.headline, 888, 820, 58, 2);
  ctx.font = font(500, 27);
  ctx.fillStyle = "#a7adb7";
  drawWrapped(ctx, data.recognition, 1020, 780, 38, 3);

  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.beginPath();
  ctx.moveTo(118, 1195);
  ctx.lineTo(962, 1195);
  ctx.moveTo(118, 1360);
  ctx.lineTo(962, 1360);
  ctx.stroke();
  ctx.font = font(750, 18);
  ctx.fillStyle = "#8b93a0";
  centered(ctx, "EN ESTE TORNEO", 1235);
  if (data.stats) {
    const values = [
      ["PJ", String(data.stats.partidos)],
      ["PG", String(data.stats.victorias)],
      ["PP", String(data.stats.derrotas)],
      ["DIF", formatPodiumShareDif(data.stats.dif)],
    ];
    values.forEach(([label, value], index) => {
      const x = 224 + index * 210;
      ctx.font = font(750, 18);
      ctx.fillStyle = "#8b93a0";
      centeredAt(ctx, label, x, 1280);
      ctx.font = font(800, 42);
      ctx.fillStyle = "#f5f2eb";
      centeredAt(ctx, value, x, 1332);
    });
  }

  ctx.font = font(600, 25);
  ctx.fillStyle = "#c4c8cf";
  drawWrapped(ctx, data.motivation, 1460, 780, 34, 3);
  ctx.fillStyle = "#8b93a0";
  drawWrapped(
    ctx,
    "Gracias por participar en el torneo y ser parte de esta competencia.",
    1590,
    780,
    31,
    2,
  );
  ctx.font = font(750, 24);
  ctx.fillStyle = "#f5f2eb";
  drawWrapped(
    ctx,
    "Esto no termina aquí. Nos vemos en la próxima competencia.",
    1685,
    780,
    31,
    2,
  );
  ctx.font = font(650, 19);
  ctx.fillStyle = "#8b93a0";
  centered(ctx, "@rivieraopen   ·   Instagram   TikTok   Facebook", 1800);
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
