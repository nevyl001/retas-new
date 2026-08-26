import { supabase } from "../supabaseClient";
import {
  EVENTO_FLYER_BUCKET,
  EVENTO_FLYER_MAX_BYTES,
} from "../torneoExpress/constants";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const TEAM_LOGO_MAX_SIDE = 512;

type DrawableSource = HTMLImageElement | ImageBitmap;

async function loadDrawableSource(file: File): Promise<{
  source: DrawableSource;
  width: number;
  height: number;
  release: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
        resizeQuality: "high",
      } as unknown as ImageBitmapOptions);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      /* fallback */
    }
  }

  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("No se pudo leer la imagen"));
    el.src = url;
  });
  URL.revokeObjectURL(url);
  return {
    source: img,
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
    release: () => {},
  };
}

/**
 * Redimensiona el logo manteniendo aspect ratio (máx. lado TEAM_LOGO_MAX_SIDE).
 * Prefiere PNG para preservar transparencia.
 */
async function resizeTeamLogoFile(file: File): Promise<{
  blob: Blob;
  contentType: string;
  ext: string;
}> {
  const { source, width, height, release } = await loadDrawableSource(file);
  try {
    const maxSide = Math.max(width, height);
    const scale =
      maxSide > TEAM_LOGO_MAX_SIDE ? TEAM_LOGO_MAX_SIDE / maxSide : 1;
    const outW = Math.max(1, Math.round(width * scale));
    const outH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas no disponible");
    ctx.clearRect(0, 0, outW, outH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, outW, outH);

    const preferPng =
      (file.type || "").toLowerCase().includes("png") ||
      (file.type || "").toLowerCase().includes("webp");

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error("Error al procesar la imagen"));
        },
        preferPng ? "image/png" : "image/jpeg",
        preferPng ? undefined : 0.92
      );
    });

    return preferPng
      ? { blob, contentType: "image/png", ext: "png" }
      : { blob, contentType: "image/jpeg", ext: "jpg" };
  } finally {
    release();
  }
}

function validateLogoFile(file: File): void {
  const type = (file.type || "").toLowerCase();
  if (!ALLOWED_TYPES.has(type)) {
    throw new Error("Formato no válido. Usa JPEG, PNG o WebP.");
  }
  if (file.size > EVENTO_FLYER_MAX_BYTES) {
    throw new Error("La imagen supera 5 MB. Elige un archivo más ligero.");
  }
}

function teamLogoStoragePath(
  organizadorId: string,
  tournamentId: string,
  teamIndex: number,
  ext: string
): string {
  return `${organizadorId.trim()}/team-logos/${tournamentId.trim()}/${teamIndex}.${ext}`;
}

/**
 * Sube logo de equipo al bucket `evento-flyers` (mismas políticas: carpeta = auth.uid()).
 * Path: `{organizadorId}/team-logos/{tournamentId}/{teamIndex}.{ext}`
 */
export async function uploadTeamLogo(
  organizadorId: string,
  tournamentId: string,
  teamIndex: number,
  file: File
): Promise<string> {
  const org = organizadorId.trim();
  const tid = tournamentId.trim();
  if (!org || !tid) {
    throw new Error("Faltan datos del organizador o del evento");
  }
  if (!Number.isInteger(teamIndex) || teamIndex < 0) {
    throw new Error("Índice de equipo inválido");
  }
  validateLogoFile(file);

  let blob: Blob;
  let contentType: string;
  let ext: string;
  try {
    const resized = await resizeTeamLogoFile(file);
    blob = resized.blob;
    contentType = resized.contentType;
    ext = resized.ext;
  } catch {
    blob = file;
    contentType = file.type || "image/png";
    ext = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";
  }

  const path = teamLogoStoragePath(org, tid, teamIndex, ext);
  const { error } = await supabase.storage.from(EVENTO_FLYER_BUCKET).upload(path, blob, {
    upsert: true,
    contentType,
    cacheControl: "3600",
  });

  if (error) {
    throw new Error(
      error.message?.trim()
        ? `No se pudo subir el logo: ${error.message}`
        : "No se pudo subir el logo"
    );
  }

  const { data } = supabase.storage.from(EVENTO_FLYER_BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

/** Intenta borrar el objeto en Storage (best-effort). */
export async function removeTeamLogoFromStorage(
  organizadorId: string,
  tournamentId: string,
  teamIndex: number
): Promise<void> {
  const org = organizadorId.trim();
  const tid = tournamentId.trim();
  if (!org || !tid || teamIndex < 0) return;
  const paths = ["png", "jpg", "webp", "jpeg"].map((ext) =>
    teamLogoStoragePath(org, tid, teamIndex, ext === "jpeg" ? "jpg" : ext)
  );
  try {
    await supabase.storage.from(EVENTO_FLYER_BUCKET).remove(paths);
  } catch {
    /* ignore */
  }
}
