import {
  computeCoverCrop,
  initialsFromName,
} from "../torneoExpress/renderGroupWinnerShareCanvas";
import {
  DUELO2V2_SHARE_HEIGHT,
  DUELO2V2_SHARE_WIDTH,
  type Duelo2v2SharePlayer,
  type Duelo2v2SharePresentation,
} from "./duelo2v2SharePresentation";

export { duelo2v2ShareFileName } from "./duelo2v2SharePresentation";

const TONE = {
  winner: "#b89654",
  runnerUp: "#b6bdc7",
} as const;

const COLOR = {
  text: "#f4f1ea",
  textSoft: "#c4c8cf",
  textMuted: "#8b93a0",
  line: "rgba(244,241,234,0.12)",
} as const;

function font(weight: number, size: number): string {
  if (typeof document === "undefined") {
    return `${weight} ${size}px system-ui, sans-serif`;
  }
  const styles = getComputedStyle(document.documentElement);
  const family =
    styles.getPropertyValue("--font-display").trim() ||
    styles.getPropertyValue("--ro-font-heading").trim() ||
    'system-ui, -apple-system, "Segoe UI", sans-serif';
  return `${weight} ${size}px ${family}`;
}

function centered(ctx: CanvasRenderingContext2D, text: string, y: number) {
  ctx.textAlign = "center";
  ctx.fillText(text, DUELO2V2_SHARE_WIDTH / 2, y);
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
  player: Duelo2v2SharePlayer,
  x: number,
  y: number,
  diameter: number,
  tone: string,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, diameter / 2 + 6, 0, Math.PI * 2);
  ctx.strokeStyle = `${tone}88`;
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, diameter / 2, 0, Math.PI * 2);
  ctx.clip();

  if (player.fotoUrl) {
    try {
      const image = await loadImage(player.fotoUrl);
      const crop = computeCoverCrop(image.width, image.height, diameter, diameter);
      ctx.drawImage(
        image,
        crop.sx,
        crop.sy,
        crop.sw,
        crop.sh,
        x - diameter / 2,
        y - diameter / 2,
        diameter,
        diameter,
      );
    } catch {
      ctx.fillStyle = "#2a3038";
      ctx.fillRect(x - diameter / 2, y - diameter / 2, diameter, diameter);
      ctx.fillStyle = COLOR.text;
      ctx.font = font(700, diameter * 0.28);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(initialsFromName(player.name), x, y);
    }
  } else {
    ctx.fillStyle = "#2a3038";
    ctx.fillRect(x - diameter / 2, y - diameter / 2, diameter, diameter);
    ctx.fillStyle = COLOR.text;
    ctx.font = font(700, diameter * 0.28);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initialsFromName(player.name), x, y);
  }
  ctx.restore();
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("canvas_blob_failed"));
    }, "image/png");
  });
}

export async function renderDuelo2v2ShareCanvas(
  data: Duelo2v2SharePresentation,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = DUELO2V2_SHARE_WIDTH;
  canvas.height = DUELO2V2_SHARE_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_context_failed");

  const tone = data.place === "winner" ? TONE.winner : TONE.runnerUp;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.textBaseline = "alphabetic";

  ctx.font = font(750, 21);
  ctx.fillStyle = COLOR.textMuted;
  ctx.textAlign = "left";
  ctx.fillText(data.dueloNombre.toUpperCase(), 104, 292);
  ctx.font = font(650, 18);
  ctx.fillText("DUELO 2 VS 2", 104, 324);

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

  ctx.font = font(800, 22);
  ctx.fillStyle = tone;
  centered(ctx, data.badge.toUpperCase(), 444);

  ctx.font = font(900, 56);
  ctx.fillStyle = COLOR.text;
  centered(ctx, data.headline.toUpperCase(), 540);

  const [first, second] = data.players.slice(0, 2);
  const avatarSize = data.place === "winner" ? 292 : 248;
  const avatarY = data.place === "winner" ? 760 : 780;
  if (first) await drawAvatar(ctx, first, 320, avatarY, avatarSize, tone);
  if (second) await drawAvatar(ctx, second, 760, avatarY, avatarSize, tone);

  ctx.strokeStyle = COLOR.line;
  ctx.beginPath();
  ctx.moveTo(540, 620);
  ctx.lineTo(540, avatarY + avatarSize / 2 + 20);
  ctx.stroke();

  ctx.font = font(700, 28);
  ctx.fillStyle = COLOR.text;
  if (first) {
    ctx.textAlign = "center";
    ctx.fillText(first.name.split(/\s+/)[0] ?? first.name, 320, avatarY + avatarSize / 2 + 58);
  }
  if (second) {
    ctx.fillText(second.name.split(/\s+/)[0] ?? second.name, 760, avatarY + avatarSize / 2 + 58);
  }

  ctx.font = font(750, 24);
  ctx.fillStyle = tone;
  centered(ctx, data.teamName.toUpperCase(), avatarY + avatarSize / 2 + 110);

  const scoreY = avatarY + avatarSize / 2 + 210;
  if (data.place === "winner") {
    ctx.font = font(900, 132);
    ctx.fillStyle = COLOR.text;
    centered(ctx, String(data.setsWin), scoreY);
    ctx.strokeStyle = COLOR.line;
    ctx.beginPath();
    ctx.moveTo(470, scoreY + 36);
    ctx.lineTo(610, scoreY + 36);
    ctx.stroke();
    ctx.font = font(800, 88);
    ctx.fillStyle = COLOR.textSoft;
    centered(ctx, String(data.setsLoss), scoreY + 120);
    ctx.font = font(700, 20);
    ctx.fillStyle = COLOR.textMuted;
    centered(ctx, "VICTORIA FINAL", scoreY + 170);
  } else {
    ctx.font = font(900, 96);
    ctx.fillStyle = COLOR.text;
    centered(ctx, `${data.setsWin} : ${data.setsLoss}`, scoreY + 20);
    ctx.font = font(700, 20);
    ctx.fillStyle = COLOR.textMuted;
    centered(ctx, "MARCADOR FINAL", scoreY + 72);
  }

  let cursorY = scoreY + (data.place === "winner" ? 230 : 130);
  if (data.setRows.length > 0) {
    const gap = data.setRows.length > 2 ? 180 : 220;
    const startX =
      DUELO2V2_SHARE_WIDTH / 2 - ((data.setRows.length - 1) * gap) / 2;
    data.setRows.forEach((row, index) => {
      const x = startX + index * gap;
      ctx.textAlign = "center";
      ctx.font = font(700, 18);
      ctx.fillStyle = COLOR.textMuted;
      ctx.fillText(row.label.toUpperCase(), x, cursorY);
      ctx.font = font(800, 34);
      ctx.fillStyle = COLOR.textSoft;
      ctx.fillText(row.score, x, cursorY + 44);
    });
    cursorY += 96;
  }

  if (data.gamesTotal) {
    ctx.font = font(600, 22);
    ctx.fillStyle = COLOR.textMuted;
    centered(ctx, data.gamesTotal.toUpperCase(), cursorY + 24);
    cursorY += 56;
  }

  ctx.font = font(500, 26);
  ctx.fillStyle = COLOR.textSoft;
  const words = data.message.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  const maxWidth = 820;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    ctx.font = font(500, 26);
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  lines.slice(0, 3).forEach((entry, index) => {
    centered(ctx, entry, cursorY + 40 + index * 36);
  });

  ctx.font = font(700, 20);
  ctx.fillStyle = tone;
  centered(ctx, data.clubName.toUpperCase(), DUELO2V2_SHARE_HEIGHT - 148);
  if (data.showMotherAttribution) {
    ctx.font = font(600, 16);
    ctx.fillStyle = COLOR.textMuted;
    centered(ctx, "by Riviera Open", DUELO2V2_SHARE_HEIGHT - 118);
  }

  return canvas;
}

export async function renderDuelo2v2SharePng(
  data: Duelo2v2SharePresentation,
): Promise<Blob> {
  return canvasToBlob(await renderDuelo2v2ShareCanvas(data));
}
