import { supabase } from "../supabaseClient";
import {
  EVENTO_FLYER_BUCKET,
  EVENTO_FLYER_MAX_BYTES,
  EVENTO_FLYER_MAX_SIDE,
} from "./constants";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

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
 * Redimensiona el flyer manteniendo aspect ratio (máx. lado EVENTO_FLYER_MAX_SIDE).
 * No recorta cuadrado: el banner es landscape.
 */
export async function resizeEventoFlyerFile(file: File): Promise<{
  blob: Blob;
  contentType: string;
  ext: string;
}> {
  const { source, width, height, release } = await loadDrawableSource(file);
  try {
    const maxSide = Math.max(width, height);
    const scale =
      maxSide > EVENTO_FLYER_MAX_SIDE ? EVENTO_FLYER_MAX_SIDE / maxSide : 1;
    const outW = Math.max(1, Math.round(width * scale));
    const outH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas no disponible");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, outW, outH);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error("Error al procesar la imagen"));
        },
        "image/jpeg",
        0.9
      );
    });

    return { blob, contentType: "image/jpeg", ext: "jpg" };
  } finally {
    release();
  }
}

function validateFlyerFile(file: File): void {
  const type = (file.type || "").toLowerCase();
  if (!ALLOWED_TYPES.has(type)) {
    throw new Error("Formato no válido. Usa JPEG, PNG o WebP.");
  }
  if (file.size > EVENTO_FLYER_MAX_BYTES) {
    throw new Error("La imagen supera 5 MB. Elige un archivo más ligero.");
  }
}

/**
 * Sube el flyer del evento a Storage y devuelve la URL pública.
 * Path estable: `{organizadorId}/{eventoId}.jpg` (upsert).
 */
export async function uploadEventoFlyer(
  organizadorId: string,
  eventoId: string,
  file: File
): Promise<string> {
  const org = organizadorId.trim();
  const eid = eventoId.trim();
  if (!org || !eid) {
    throw new Error("Faltan datos del organizador o del evento");
  }
  validateFlyerFile(file);

  let blob: Blob;
  let contentType: string;
  let ext: string;
  try {
    const resized = await resizeEventoFlyerFile(file);
    blob = resized.blob;
    contentType = resized.contentType;
    ext = resized.ext;
  } catch {
    // Si falla el canvas, sube el original (ya validado).
    blob = file;
    contentType = file.type || "image/jpeg";
    ext =
      contentType.includes("png")
        ? "png"
        : contentType.includes("webp")
          ? "webp"
          : "jpg";
  }

  const path = `${org}/${eid}.${ext}`;
  const { error } = await supabase.storage
    .from(EVENTO_FLYER_BUCKET)
    .upload(path, blob, {
      upsert: true,
      contentType,
      cacheControl: "3600",
    });

  if (error) {
    throw new Error(
      error.message?.trim()
        ? `No se pudo subir el flyer: ${error.message}`
        : "No se pudo subir el flyer"
    );
  }

  const { data } = supabase.storage
    .from(EVENTO_FLYER_BUCKET)
    .getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}
