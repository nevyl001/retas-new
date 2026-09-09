/** Utilidades de recorte interactivo → JPEG para avatares de jugador. */

export const AVATAR_MIN_SIDE_PX = 400;

export type AvatarCropArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function meetsAvatarMinDimensions(width: number, height: number): boolean {
  return Math.min(width, height) >= AVATAR_MIN_SIDE_PX;
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo leer la imagen"));
    img.src = src;
  });
}

/** Lee dimensiones de un File sin subirlo. */
export async function readImageDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(url);
    return {
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Recorta el área en píxeles y devuelve JPEG. */
export async function cropImageAreaToJpegBlob(
  imageSrc: string,
  area: AvatarCropArea,
  outputSize = 1200,
  quality = 0.92
): Promise<Blob> {
  const image = await loadImageElement(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    outputSize,
    outputSize
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Error al procesar imagen"));
      },
      "image/jpeg",
      quality
    );
  });
}

export function avatarBlobToFile(blob: Blob, filename = "avatar.jpg"): File {
  return new File([blob], filename, { type: "image/jpeg" });
}
