/**
 * Enlaces de vista pública compartible (TV, tablet, móvil).
 * Rutas canónicas por modo; las URLs legadas /public/pantalla y /public/americano-pantalla redirigen aquí.
 */

export type PublicVistaPublicaMode =
  | "americano"
  | "duelo"
  | "duelo-2v2"
  | "liga"
  | "te"
  | "torneo-express"
  | "reta";

export function normalizePublicVistaPublicaMode(
  raw: string
): PublicVistaPublicaMode | null {
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

export function buildPublicVistaPublicaPath(
  mode: PublicVistaPublicaMode,
  id: string,
  jornada?: number
): string {
  const encId = encodeURIComponent(id.trim());

  switch (mode) {
    case "americano":
      return `/public/vista-publica/americano/${encId}`;
    case "duelo":
    case "duelo-2v2":
      return `/public/duelo-2v2/${encId}`;
    case "liga":
      if (jornada != null && Number.isFinite(jornada)) {
        return `/public/liga/${encId}/jornada/${jornada}`;
      }
      return `/public/liga/${encId}`;
    case "te":
    case "torneo-express":
      return `/torneo-express/${encId}/general`;
    case "reta":
    default:
      return `/public/${encId}`;
  }
}

export function buildPublicVistaPublicaUrl(
  mode: PublicVistaPublicaMode,
  id: string,
  jornada?: number
): string {
  const path = buildPublicVistaPublicaPath(mode, id, jornada);
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

/** ID de torneo americano en `/public/vista-publica/americano/{id}`. */
export function parsePublicAmericanoVistaPublicaPath(
  pathname: string
): string | null {
  const m = pathname.match(/^\/public\/vista-publica\/americano\/([^/?#]+)/i);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]).trim() || null;
  } catch {
    return m[1].trim() || null;
  }
}

/**
 * Redirige rutas legadas (`/public/pantalla/...`, `/public/americano-pantalla/...`)
 * a la vista pública canónica del modo.
 */
export function resolvePublicVistaPublicaRedirect(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";

  const legacyAmericanoBoard = path.match(
    /^\/public\/americano-pantalla\/([^/]+)$/i
  );
  if (legacyAmericanoBoard) {
    let id = legacyAmericanoBoard[1];
    try {
      id = decodeURIComponent(id);
    } catch {
      /* keep raw */
    }
    return buildPublicVistaPublicaPath("americano", id);
  }

  const legacyPantalla = path.match(
    /^\/public\/pantalla\/([^/]+)\/([^/]+)(?:\/jornada\/(\d+))?$/i
  );
  if (legacyPantalla) {
    const mode = normalizePublicVistaPublicaMode(legacyPantalla[1]);
    if (!mode) return null;
    let id = legacyPantalla[2];
    try {
      id = decodeURIComponent(id);
    } catch {
      /* keep raw */
    }
    const jornada = legacyPantalla[3] ? Number(legacyPantalla[3]) : undefined;
    return buildPublicVistaPublicaPath(
      mode,
      id,
      jornada != null && Number.isFinite(jornada) ? jornada : undefined
    );
  }

  return null;
}
