import { supabase } from "../supabaseClient";
import { AVATAR_BUCKET } from "./constants";

/** Tamaño alto para que el fondo de la ficha no se pixelee en móvil/retina. */
const OUTPUT_SIZE = 1200;
const JPEG_QUALITY = 0.92;

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
      /* fallback abajo */
    }
  }

  const img = await loadImage(file);
  return {
    source: img,
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
    release: () => {},
  };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen"));
    };
    img.src = url;
  });
}

/**
 * Recorte cuadrado centrado en horizontal.
 * En vertical prioriza la zona superior (cara/torso), con un leve margen si hay espacio.
 */
export function computeSquareCrop(
  width: number,
  height: number
): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height);
  const sx = Math.max(0, Math.round((width - side) / 2));

  let sy: number;
  if (height > width) {
    const slack = height - side;
    sy = slack > 0 ? Math.round(slack * 0.1) : 0;
  } else {
    sy = 0;
  }

  sy = Math.max(0, Math.min(sy, height - side));

  return { sx, sy, side };
}

/** Recorta cuadrado, redimensiona y devuelve JPEG nítido para avatar y hero. */
export async function resizeAvatarFile(file: File): Promise<Blob> {
  const { source, width, height, release } = await loadDrawableSource(file);
  try {
    const { sx, sy, side } = computeSquareCrop(width, height);

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas no disponible");

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, sx, sy, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Error al procesar imagen"));
        },
        "image/jpeg",
        JPEG_QUALITY
      );
    });
  } finally {
    release();
  }
}

export async function uploadJugadorAvatar(
  organizadorId: string,
  jugadorId: string,
  file: File
): Promise<string> {
  const blob = await resizeAvatarFile(file);
  const path = `${organizadorId}/${jugadorId}.jpg`;
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, blob, {
      upsert: true,
      contentType: "image/jpeg",
      cacheControl: "3600",
    });
  if (error) throw error;
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}
