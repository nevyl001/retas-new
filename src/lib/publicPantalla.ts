/**
 * Modo TV unificado — rutas `/public/pantalla/{modo}/{id}`
 * Reutiliza vistas públicas existentes optimizadas para pantalla en cancha.
 */

export type PublicPantallaMode =
  | "americano"
  | "duelo"
  | "duelo-2v2"
  | "liga"
  | "te"
  | "torneo-express"
  | "reta";

export interface PublicPantallaRoute {
  mode: PublicPantallaMode;
  id: string;
  jornada?: number;
}

export function normalizePublicPantallaMode(raw: string): PublicPantallaMode | null {
  const m = raw.trim().toLowerCase();
  if (
    m === "americano" ||
    m === "duelo" ||
    m === "duelo-2v2" ||
    m === "liga" ||
    m === "te" ||
    m === "torneo-express" ||
    m === "reta"
  ) {
    return m;
  }
  return null;
}

export function parsePublicPantallaPath(pathname: string): PublicPantallaRoute | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  const m = path.match(
    /^\/public\/pantalla\/([^/]+)\/([^/]+)(?:\/jornada\/(\d+))?$/i
  );
  if (!m) return null;

  const mode = normalizePublicPantallaMode(m[1]);
  if (!mode) return null;

  let id: string;
  try {
    id = decodeURIComponent(m[2]).trim();
  } catch {
    id = m[2].trim();
  }
  if (!id) return null;

  const jornada = m[3] ? Number(m[3]) : undefined;
  return {
    mode,
    id,
    jornada: jornada != null && Number.isFinite(jornada) ? jornada : undefined,
  };
}

export function isPublicPantallaPath(pathname: string): boolean {
  return parsePublicPantallaPath(pathname) != null;
}

export function buildPublicPantallaPath(
  mode: PublicPantallaMode,
  id: string,
  jornada?: number
): string {
  const base = `/public/pantalla/${mode}/${encodeURIComponent(id.trim())}`;
  if (jornada != null && Number.isFinite(jornada)) {
    return `${base}/jornada/${jornada}`;
  }
  return base;
}

export function buildPublicPantallaUrl(
  mode: PublicPantallaMode,
  id: string,
  jornada?: number
): string {
  const path = buildPublicPantallaPath(mode, id, jornada);
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

/** Alias legado → ruta unificada (p. ej. americano-pantalla). */
export function legacyAmericanoPantallaToUnified(pathname: string): string | null {
  const m = pathname.match(/^\/public\/americano-pantalla\/([^/?#]+)/i);
  if (!m) return null;
  return buildPublicPantallaPath("americano", m[1]);
}
