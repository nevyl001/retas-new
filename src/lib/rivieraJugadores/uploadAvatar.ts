import { supabase } from "../supabaseClient";
import { AVATAR_BUCKET } from "./constants";

/** Tamaño alto para que el fondo de la ficha no se pixelee en móvil/retina. */
const OUTPUT_SIZE = 1200;
const JPEG_QUALITY = 0.92;

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
 * Recorte cuadrado para avatar: en fotos verticales prioriza la parte superior (cabeza).
 */
function computeSquareCrop(
  width: number,
  height: number
): { sx: number; sy: number; side: number } {
  const side = Math.min(width, height);
  let sx = Math.round((width - side) / 2);
  let sy = Math.round((height - side) / 2);

  if (height > width * 1.08) {
    sx = 0;
    sy = 0;
  } else if (width > height * 1.08) {
    sx = Math.round((width - side) / 2);
    sy = 0;
  }

  sx = Math.max(0, Math.min(sx, width - side));
  sy = Math.max(0, Math.min(sy, height - side));

  return { sx, sy, side };
}

/** Recorta cuadrado, redimensiona y devuelve JPEG nítido para avatar y hero. */
export async function resizeAvatarFile(file: File): Promise<Blob> {
  const img = await loadImage(file);
  const { sx, sy, side } = computeSquareCrop(img.width, img.height);

  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

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
