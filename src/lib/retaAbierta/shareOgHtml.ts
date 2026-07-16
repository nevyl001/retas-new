/**
 * Pure OG HTML builder (testable). Edge Function share-reta-og must stay aligned.
 *
 * URL compartida (WhatsApp / Copiar convocatoria):
 *   ${REACT_APP_SHARE_OG_BASE_URL}?slug=<public_slug>
 *   ej. https://<project>.supabase.co/functions/v1/share-reta-og?slug=ra-xxxx
 *
 * Destino humano: ${PUBLIC_APP_ORIGIN}/jugar/<slug>
 * No redirect inmediato: meta refresh ≥8s + enlace visible.
 */

export const RIVIERA_OG_IMAGE =
  "https://appriviera.rivieraopen.com/icon-512x512.png";
export const RIVIERA_OG_TITLE = "RivieraApp — Retas y torneos de pádel";
export const RIVIERA_OG_DESCRIPTION =
  "Organiza. Juega. Compite. Crea retas y torneos de pádel.";

export type ShareOgBrand = {
  premiumBrandingEnabled: boolean;
  brandingKey: string | null;
  clubTitle?: string | null;
};

export type ShareOgPayload = {
  slug: string;
  title: string;
  description: string;
  playUrl: string;
  canonicalUrl: string;
  brand: ShareOgBrand;
  appOrigin: string;
  /** Si premium sin imagen válida → Riviera */
  clubImageAbsoluteUrl?: string | null;
};

export function resolveShareOgImage(input: {
  brand: ShareOgBrand;
  appOrigin: string;
  clubImageAbsoluteUrl?: string | null;
}): string {
  if (
    input.brand.premiumBrandingEnabled &&
    input.brand.brandingKey &&
    input.clubImageAbsoluteUrl
  ) {
    return input.clubImageAbsoluteUrl;
  }
  if (input.brand.premiumBrandingEnabled && input.brand.brandingKey) {
    const key = encodeURIComponent(input.brand.brandingKey);
    return `${input.appOrigin.replace(/\/$/, "")}/branding/${key}/og.png`;
  }
  return RIVIERA_OG_IMAGE;
}

export function resolveShareOgTitle(input: {
  eventTitle: string;
  brand: ShareOgBrand;
}): string {
  if (input.brand.premiumBrandingEnabled && input.brand.clubTitle) {
    return `${input.eventTitle} · ${input.brand.clubTitle}`;
  }
  if (input.brand.premiumBrandingEnabled && input.brand.brandingKey) {
    return input.eventTitle;
  }
  return input.eventTitle || RIVIERA_OG_TITLE;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildShareRetaOgHtml(payload: ShareOgPayload): string {
  const image = resolveShareOgImage({
    brand: payload.brand,
    appOrigin: payload.appOrigin,
    clubImageAbsoluteUrl: payload.clubImageAbsoluteUrl,
  });
  const title = resolveShareOgTitle({
    eventTitle: payload.title,
    brand: payload.brand,
  });
  const description = payload.description || RIVIERA_OG_DESCRIPTION;

  if (!image.startsWith("http://") && !image.startsWith("https://")) {
    throw new Error("og:image must be absolute URL");
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(image)}" />
  <meta property="og:url" content="${escapeHtml(payload.canonicalUrl)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(image)}" />
  <link rel="canonical" href="${escapeHtml(payload.canonicalUrl)}" />
  <meta http-equiv="refresh" content="8;url=${escapeHtml(payload.playUrl)}" />
</head>
<body>
  <p><a href="${escapeHtml(payload.playUrl)}">Abrir convocatoria</a></p>
  <script>setTimeout(function(){ location.replace(${JSON.stringify(
    payload.playUrl
  )}); }, 8500);</script>
</body>
</html>`;
}

/** Políticas de exposición: false → 404 (no HTML con datos). */
export function shouldExposeShareOg(input: {
  enabled: boolean | null | undefined;
  status: string | null | undefined;
}): boolean {
  if (input.enabled === false) return false;
  const s = String(input.status || "").toLowerCase();
  if (s === "draft" || s === "cancelled" || s === "closed") return false;
  return true;
}
