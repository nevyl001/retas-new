export const GROUP_WINNER_SHARE_WIDTH = 1080;
export const GROUP_WINNER_SHARE_HEIGHT = 1920;

export type GroupWinnerSharePlayer = {
  name: string;
  avatarUrl?: string | null;
};

export type GroupWinnerShareData = {
  tournamentName: string;
  clubName?: string | null;
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

function font(weight: number, size: number): string {
  const family =
    typeof document !== "undefined"
      ? getComputedStyle(document.documentElement)
          .getPropertyValue("--ro-font-heading")
          .trim()
      : "";
  return `${weight} ${size}px ${
    family || 'system-ui, -apple-system, "Segoe UI", sans-serif'
  }`;
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
  if (lines.length <= maxLines) return lines;
  return lines.slice(0, maxLines);
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
        ? `${line.slice(0, Math.max(1, Math.floor(line.length * 0.78)))}…`
        : line,
    fontSize: minFont,
  }));
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
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
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
      diameter,
      diameter
    );
    ctx.drawImage(
      image,
      crop.sx,
      crop.sy,
      crop.sw,
      crop.sh,
      centerX - radius,
      centerY - radius,
      diameter,
      diameter
    );
  } else {
    const gradient = ctx.createLinearGradient(
      centerX - radius,
      centerY - radius,
      centerX + radius,
      centerY + radius
    );
    gradient.addColorStop(0, "#30343a");
    gradient.addColorStop(1, "#131518");
    ctx.fillStyle = gradient;
    ctx.fillRect(centerX - radius, centerY - radius, diameter, diameter);
    ctx.fillStyle = "#f7f3ed";
    ctx.font = font(800, 66);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initialsFromName(player.name), centerX, centerY + 4);
  }
  ctx.restore();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius - 3, 0, Math.PI * 2);
  ctx.stroke();
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
  const accent = data.themeAccent?.trim() || "#c9845c";
  const primary = data.themePrimary?.trim() || "#111416";
  const cream = "#f7f3ed";
  const muted = "#c9beb2";
  const pad = 86;

  const background = ctx.createLinearGradient(0, 0, w, h);
  background.addColorStop(0, primary);
  background.addColorStop(0.52, "#111110");
  background.addColorStop(1, "#1d1612");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, w, h);

  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  for (let x = -h; x < w; x += 180) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + h, h);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = accent;
  ctx.fillRect(pad, 148, 78, 5);
  ctx.fillStyle = muted;
  ctx.font = font(750, 26);
  ctx.fillText("RIVIERA OPEN", pad, 118);

  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(247,243,237,0.48)";
  ctx.font = font(700, 22);
  ctx.fillText("LOGRO DE GRUPO", w - pad, 118);
  ctx.textAlign = "left";

  const eventLines = textLinesToFit(
    ctx,
    data.tournamentName.toUpperCase(),
    w - pad * 2,
    2,
    54,
    34,
    800
  );
  let eventY = 252;
  ctx.fillStyle = cream;
  for (const line of eventLines) {
    ctx.font = font(800, line.fontSize);
    ctx.fillText(line.text, pad, eventY);
    eventY += line.fontSize * 1.12;
  }
  ctx.fillStyle = muted;
  ctx.font = font(750, 28);
  ctx.fillText(`${data.categoryName.toUpperCase()}  ·  ${data.groupName.toUpperCase()}`, pad, eventY + 30);

  const avatarY = 590;
  await Promise.all([
    drawAvatar(ctx, data.player1, 345, avatarY, 222, accent),
    drawAvatar(ctx, data.player2, 735, avatarY, 222, accent),
  ]);
  ctx.textAlign = "center";
  ctx.fillStyle = cream;
  for (const [player, x] of [
    [data.player1, 345],
    [data.player2, 735],
  ] as const) {
    const lines = textLinesToFit(ctx, player.name, 270, 2, 30, 22, 700);
    let playerY = 746;
    for (const line of lines) {
      ctx.font = font(700, line.fontSize);
      ctx.fillText(line.text, x, playerY);
      playerY += line.fontSize * 1.16;
    }
  }

  ctx.fillStyle = cream;
  ctx.font = font(800, 84);
  ctx.fillText("¡FELICIDADES!", w / 2, 930);
  ctx.fillStyle = muted;
  ctx.font = font(550, 34);
  const copy = textLinesToFit(
    ctx,
    `Lo dieron todo y se quedaron con el ${data.groupName}.`,
    w - 180,
    2,
    34,
    28,
    550
  );
  let copyY = 992;
  for (const line of copy) {
    ctx.font = font(550, line.fontSize);
    ctx.fillText(line.text, w / 2, copyY);
    copyY += line.fontSize * 1.28;
  }

  ctx.fillStyle = muted;
  ctx.font = font(800, 26);
  ctx.fillText(`GANADORES DEL ${data.groupName.toUpperCase()}`, w / 2, 1135);
  ctx.fillStyle = cream;
  const pair = textLinesToFit(ctx, data.pairName, w - 160, 2, 54, 34, 800);
  let pairY = 1200;
  for (const line of pair) {
    ctx.font = font(800, line.fontSize);
    ctx.fillText(line.text, w / 2, pairY);
    pairY += line.fontSize * 1.12;
  }

  const statsTop = 1355;
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
      ctx.moveTo(x, statsTop);
      ctx.lineTo(x, statsTop + 164);
      ctx.stroke();
    }
    ctx.fillStyle = cream;
    ctx.font = font(800, 72);
    ctx.fillText(stat.value, x + statW / 2, statsTop + 72);
    ctx.fillStyle = muted;
    ctx.font = font(800, 22);
    ctx.fillText(stat.label, x + statW / 2, statsTop + 116);
  });

  ctx.strokeStyle = "rgba(247,243,237,0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, 1605);
  ctx.lineTo(w - pad, 1605);
  ctx.stroke();
  ctx.fillStyle = cream;
  ctx.font = font(600, 32);
  ctx.fillText("Así se juega en Riviera.", w / 2, 1685);
  ctx.fillStyle = muted;
  ctx.font = font(750, 24);
  ctx.fillText("RIVIERA OPEN", w / 2, 1760);
  ctx.font = font(500, 23);
  ctx.fillText("appriviera.rivieraopen.com", w / 2, 1802);
  ctx.textAlign = "left";

  return canvas;
}

export async function renderGroupWinnerSharePng(
  data: GroupWinnerShareData
): Promise<Blob> {
  return canvasToBlob(await renderGroupWinnerShareCanvas(data));
}
