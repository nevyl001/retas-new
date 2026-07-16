/**
 * URL de preview OG / WhatsApp para cualquier destino público.
 *
 * Con REACT_APP_SHARE_OG_BASE_URL (Edge share-reta-og):
 *   ${BASE}?slug=<public_slug>
 *   ${BASE}?dest=<pathname>
 *
 * SIN esa variable (producción aún sin Edge cableada):
 *   fallback = URL SPA real (/jugar/:slug o el dest).
 *   Así la invitación abre la convocatoria; WhatsApp verá OG madre
 *   hasta desplegar la función + env + og.png.
 *
 * NUNCA usar /share/public ni /share/reta como fallback: la SPA no
 * sirve meta OG y rompe el destino al abrir el enlace.
 */

export type SharePublicOgTarget =
  | { kind: "slug"; slug: string }
  | { kind: "dest"; pathname: string };

function configuredShareOgBase(): string {
  return (process.env.REACT_APP_SHARE_OG_BASE_URL || "").replace(/\/$/, "");
}

function appOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "";
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
  const envBase = configuredShareOgBase();

  if (target.kind === "slug") {
    const s = target.slug.trim();
    if (!s) return "";
    if (envBase) {
      return `${envBase}?slug=${encodeURIComponent(s)}`;
    }
    const o = appOrigin();
    const path = `/jugar/${encodeURIComponent(s)}`;
    return o ? `${o}${path}` : path;
  }

  const dest = normalizePublicDestPath(target.pathname);
  if (!dest || dest === "/") return "";
  if (envBase) {
    return `${envBase}?dest=${encodeURIComponent(dest)}`;
  }
  const o = appOrigin();
  return o ? `${o}${dest}` : dest;
}

/** Compat convocatoria: slug → OG (o /jugar si no hay Edge). */
export function buildShareRetaOgUrl(slug: string): string {
  return buildSharePublicOgUrl({ kind: "slug", slug });
}

/**
 * A partir de la URL SPA, genera la URL a copiar para WhatsApp.
 * Con Edge configurada → share-reta-og; si no → la propia SPA.
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

/** true solo cuando el FE apunta a la Edge Function real. */
export function isShareOgEdgeConfigured(): boolean {
  return Boolean(configuredShareOgBase());
}
