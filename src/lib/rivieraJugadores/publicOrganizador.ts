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
