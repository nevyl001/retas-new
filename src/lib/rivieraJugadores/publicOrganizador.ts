import { supabase } from "../supabaseClient";

/** UUID del club/organizador para rankings públicos (build-time, un solo club). */
export function getPublicOrganizadorIdFromEnv(): string | null {
  const id = process.env.REACT_APP_RIVIERA_PUBLIC_ORGANIZADOR_ID?.trim();
  return id || null;
}

export function getPublicOrganizadorIdFromSearch(): string | null {
  if (typeof window === "undefined") return null;
  const org = new URLSearchParams(window.location.search).get("org")?.trim();
  return org || null;
}

/** Org en la ruta canónica `/ranking/o/{organizadorId}`. */
export function getPublicOrganizadorIdFromPath(pathname?: string): string | null {
  const path =
    pathname ??
    (typeof window !== "undefined" ? window.location.pathname : "");
  const m = path.replace(/\/+$/, "").match(/^\/ranking\/o\/([^/]+)$/i);
  const raw = m?.[1];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).trim() || null;
  } catch {
    return raw.trim() || null;
  }
}

/** Org resuelto solo desde la URL (ruta o query), sin sesión ni env. */
export function getPublicOrganizadorIdWithoutUser(pathname?: string): string | null {
  return (
    getPublicOrganizadorIdFromPath(pathname) ||
    getPublicOrganizadorIdFromSearch() ||
    null
  );
}

/**
 * Org para páginas públicas de jugadores.
 * Prioridad: URL explícita → usuario autenticado (solo si no hay org en URL).
 */
export function resolvePublicOrganizadorId(
  fallbackUserId?: string | null,
  pathname?: string
): string | null {
  const fromUrl = getPublicOrganizadorIdWithoutUser(pathname);
  if (fromUrl) return fromUrl;
  return fallbackUserId?.trim() || null;
}

/** @deprecated Ya no se usa sessionStorage para evitar mezclar rankings entre perfiles. */
export function getPublicOrganizadorIdFromSession(): string | null {
  return null;
}

/** @deprecated */
export function persistPublicOrganizadorId(_id: string | null | undefined): void {
  /* noop — cada perfil usa su enlace /ranking/o/{id} */
}

/** @deprecated */
export async function fetchFallbackPublicOrganizadorId(): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("riviera_jugadores")
      .select("organizador_id")
      .eq("estado", "activo")
      .eq("visible_publico", true)
      .not("organizador_id", "is", null)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("[riviera-jugadores] fetchFallbackPublicOrganizadorId:", error);
      return null;
    }

    const id = (data?.organizador_id as string | undefined)?.trim();
    return id || null;
  } catch (e) {
    console.warn("[riviera-jugadores] fetchFallbackPublicOrganizadorId:", e);
    return null;
  }
}

export async function resolvePublicOrganizadorIdAsync(
  loggedInUserId?: string | null,
  pathname?: string
): Promise<string | null> {
  return resolvePublicOrganizadorId(loggedInUserId, pathname);
}
