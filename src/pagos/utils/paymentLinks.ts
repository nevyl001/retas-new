/** Enlace general de negocio. No hay checkouts por evento. */
export const OFFICIAL_CLIP_URL = "https://linkdenegocio.mx/@rivieraopen";

const CLIP_HOST = "linkdenegocio.mx";

export function officialClipUrl(): string | null {
  return authorizedClipUrl(OFFICIAL_CLIP_URL);
}

export function authorizedClipUrl(value: string): string | null {
  const raw = String(value || "").trim();
  if (!raw || /\s/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port !== "" && url.port !== "443") return null;
  if (url.hostname.toLowerCase() !== CLIP_HOST) return null;
  if (url.toString() !== OFFICIAL_CLIP_URL) return null;
  return url.toString();
}
