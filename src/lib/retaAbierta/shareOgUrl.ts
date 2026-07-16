/**
 * URL de preview OG / WhatsApp para cualquier destino público.
 *
 * Crawlers deben pegar esta URL (no la SPA) para leer meta tags del Edge Function.
 *
 * Formas:
 *   ${REACT_APP_SHARE_OG_BASE_URL}?slug=<public_slug>     → convocatoria /jugar
 *   ${REACT_APP_SHARE_OG_BASE_URL}?dest=<pathname>        → /public/..., /torneo-express/..., etc.
 *
 * Env FE: REACT_APP_SHARE_OG_BASE_URL
 * Fallback local: `${origin}/share/public?...` (requiere rewrite en deploy)
 */

export type SharePublicOgTarget =
  | { kind: "slug"; slug: string }
  | { kind: "dest"; pathname: string };

function shareOgBase(): string {
  const envBase = (process.env.REACT_APP_SHARE_OG_BASE_URL || "").replace(
    /\/$/,
    ""
  );
  if (envBase) return envBase;
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/share/public`;
  }
  return "/share/public";
}

/** Pathname canónico que empieza con `/`. */
export function normalizePublicDestPath(urlOrPath: string): string {
  const raw = (urlOrPath || "").trim();
  if (!raw) return "";
  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw);
      return `${u.pathname}${u.search}` || "/";
    }
  } catch {
    /* fall through */
  }
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return path.split("#")[0] || "/";
}

export function buildSharePublicOgUrl(target: SharePublicOgTarget): string {
  const base = shareOgBase();
  if (target.kind === "slug") {
    const s = target.slug.trim();
    if (!s) return "";
    return `${base}?slug=${encodeURIComponent(s)}`;
  }
  const dest = normalizePublicDestPath(target.pathname);
  if (!dest || dest === "/") return "";
  return `${base}?dest=${encodeURIComponent(dest)}`;
}

/** Compat convocatoria: slug → OG. */
export function buildShareRetaOgUrl(slug: string): string {
  return buildSharePublicOgUrl({ kind: "slug", slug });
}

/**
 * A partir de la URL SPA absoluta o relativa, genera la URL OG a copiar.
 * Preview humano sigue siendo la SPA; WhatsApp/Facebook usan el resultado.
 */
export function buildSharePublicOgUrlFromPlayUrl(playUrl: string): string {
  const dest = normalizePublicDestPath(playUrl);
  if (!dest) return "";
  const jugar = dest.match(/^\/(?:jugar|reta-abierta)\/([^/?#]+)/i);
  if (jugar?.[1]) {
    return buildSharePublicOgUrl({
      kind: "slug",
      slug: decodeURIComponent(jugar[1]),
    });
  }
  return buildSharePublicOgUrl({ kind: "dest", pathname: dest });
}

export function buildShareRetaOgUrlForTests(
  slug: string,
  baseUrl: string
): string {
  return `${baseUrl.replace(/\/$/, "")}?slug=${encodeURIComponent(slug.trim())}`;
}

export function buildShareDestOgUrlForTests(
  destPath: string,
  baseUrl: string
): string {
  const dest = normalizePublicDestPath(destPath);
  return `${baseUrl.replace(/\/$/, "")}?dest=${encodeURIComponent(dest)}`;
}
