/**
 * CORS compartido para las Edge Functions de Riviera App (Fase B).
 *
 * Antes: cada función definía su propio `Access-Control-Allow-Origin: "*"`
 * (6 copias independientes). Ahora: allowlist explícita de los dominios
 * reales de la aplicación (confirmados por inventario de código, no
 * inventados — ver supabase/functions/_shared/README-cors.md).
 */

/** Dominios reales que consumen estas funciones desde el navegador. */
const ALLOWED_ORIGINS = [
  "https://appriviera.rivieraopen.com",
  "https://www.rivieraopen.com",
  "https://rivieraopen.com",
  // Legacy: mantenido por compatibilidad con emails/enlaces viejos aún en circulación.
  "https://retas-new.vercel.app",
];

/** Previews de Vercel (`*.vercel.app` del proyecto) — patrón, no un dominio fijo. */
const VERCEL_PREVIEW_PATTERN = /^https:\/\/retas-new-[a-z0-9-]+\.vercel\.app$/i;

function isLocalDevOrigin(origin: string): boolean {
  return (
    Deno.env.get("ENVIRONMENT") !== "production" &&
    /^http:\/\/localhost(:\d+)?$/i.test(origin)
  );
}

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (VERCEL_PREVIEW_PATTERN.test(origin)) return true;
  if (isLocalDevOrigin(origin)) return true;
  return false;
}

/**
 * Headers CORS para una request concreta. Si el Origin no está en la
 * allowlist, se omite `Access-Control-Allow-Origin` (el navegador bloqueará
 * la respuesta) en vez de reflejar `*` o el origin no confiable.
 */
export function corsHeaders(
  req: Request,
  opts?: { methods?: string; extraAllowedHeaders?: string }
): Record<string, string> {
  const origin = req.headers.get("Origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": opts?.methods ?? "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      `authorization, x-client-info, apikey, content-type${opts?.extraAllowedHeaders ? `, ${opts.extraAllowedHeaders}` : ""}`,
    // Cachea el preflight, pero el navegador igual re-valida el Origin en cada request real.
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin as string;
  }
  return headers;
}

/** Respuesta estándar para el preflight OPTIONS. */
export function handleOptions(req: Request, opts?: { methods?: string; extraAllowedHeaders?: string }): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req, opts) });
}
