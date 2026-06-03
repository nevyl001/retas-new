import { supabase } from "../supabaseClient";

const SESSION_KEY = "riviera_public_organizador_id";

/** UUID del club/organizador para rankings públicos (build-time). */
export function getPublicOrganizadorIdFromEnv(): string | null {
  const id = process.env.REACT_APP_RIVIERA_PUBLIC_ORGANIZADOR_ID?.trim();
  return id || null;
}

export function getPublicOrganizadorIdFromSearch(): string | null {
  if (typeof window === "undefined") return null;
  const org = new URLSearchParams(window.location.search).get("org")?.trim();
  return org || null;
}

export function getPublicOrganizadorIdFromSession(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const id = sessionStorage.getItem(SESSION_KEY)?.trim();
    return id || null;
  } catch {
    return null;
  }
}

export function persistPublicOrganizadorId(id: string | null | undefined): void {
  if (typeof window === "undefined") return;
  const trimmed = id?.trim();
  if (!trimmed) return;
  try {
    sessionStorage.setItem(SESSION_KEY, trimmed);
  } catch {
    /* modo privado / cuota */
  }
}

/** Org resuelto sin depender de la sesión del usuario (URL, storage, env). */
export function getPublicOrganizadorIdWithoutUser(): string | null {
  return (
    getPublicOrganizadorIdFromSearch() ||
    getPublicOrganizadorIdFromSession() ||
    getPublicOrganizadorIdFromEnv() ||
    null
  );
}

export function resolvePublicOrganizadorId(fallbackUserId?: string | null): string | null {
  const id =
    getPublicOrganizadorIdFromSearch() ||
    getPublicOrganizadorIdFromSession() ||
    getPublicOrganizadorIdFromEnv() ||
    fallbackUserId?.trim() ||
    null;
  if (id) persistPublicOrganizadorId(id);
  return id;
}

/** Si no hay ?org= ni env, usa el organizador del primer jugador público visible. */
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
    if (id) persistPublicOrganizadorId(id);
    return id || null;
  } catch (e) {
    console.warn("[riviera-jugadores] fetchFallbackPublicOrganizadorId:", e);
    return null;
  }
}

/** Resuelve org para páginas públicas sin depender de la sesión. */
export async function resolvePublicOrganizadorIdAsync(
  loggedInUserId?: string | null
): Promise<string | null> {
  const direct = resolvePublicOrganizadorId(loggedInUserId);
  if (direct) return direct;
  return fetchFallbackPublicOrganizadorId();
}
