/**
 * URL de preview OG / WhatsApp para convocatoria.
 * Crawlers deben pegar esta URL (no /jugar) para leer meta tags del Edge Function.
 *
 * Env:
 *   REACT_APP_SHARE_OG_BASE_URL — ej.
 *   https://<project>.supabase.co/functions/v1/share-reta-og
 * Si falta, se usa origin + path documentado (requiere rewrite/proxy en deploy).
 */
export function buildShareRetaOgUrl(slug: string): string {
  const s = slug.trim();
  if (!s) return "";
  const base = (process.env.REACT_APP_SHARE_OG_BASE_URL || "").replace(/\/$/, "");
  if (base) {
    return `${base}?slug=${encodeURIComponent(s)}`;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/share/reta/${encodeURIComponent(s)}`;
  }
  return `/share/reta/${encodeURIComponent(s)}`;
}

export function buildShareRetaOgUrlForTests(
  slug: string,
  baseUrl: string
): string {
  return `${baseUrl.replace(/\/$/, "")}?slug=${encodeURIComponent(slug.trim())}`;
}
